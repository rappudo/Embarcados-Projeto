//! MQTT subscriber.
//!
//! Listens for access events published by the edge Raspberry Pi on
//! `facegate/events/access` and persists them into PostgreSQL. Also
//! subscribes to `facegate/health/#` so future heartbeat work plugs
//! into the same loop without changing topology.
//!
//! Architecture: `start_subscriber` performs the connect-and-subscribe
//! synchronously (so wiring errors surface during boot) and then
//! spawns the event-loop polling task, which runs forever and reconnects
//! on broker errors.
//!
//! State exposure: a shared `MqttState` wrapped in an `Arc<RwLock<...>>`
//! is published to the rest of the app via `AppState`. The HTTP route
//! `GET /system/mqtt-status` reads it; the event loop writes it.

use rumqttc::{AsyncClient, Event, EventLoop, Incoming, MqttOptions, QoS};
use serde::Deserialize;
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

const CLIENT_ID: &str = "facegate-backend";
const TOPIC_ACCESS: &str = "facegate/events/access";
const TOPIC_HEALTH: &str = "facegate/health/#";

/// Live snapshot of the MQTT subscriber, readable by HTTP handlers.
///
/// `connected` flips false on any `Err` returned by the event loop and
/// true on each successful `ConnAck`. `last_message_at_ms` is set on
/// any inbound Publish, regardless of topic — it's a proxy for "broker
/// is alive AND edge is talking" combined.
#[derive(Debug, Default, Clone, serde::Serialize)]
pub struct MqttState {
    pub connected: bool,
    pub last_message_at_ms: Option<i64>,
}

/// Convenience alias — the same handle shared between the event loop
/// (writer) and the system-status route (reader).
pub type MqttStateHandle = Arc<RwLock<MqttState>>;

/// Payload published by the edge on `facegate/events/access`.
///
/// Schema must stay in sync with `edge/serialization.cpp`. If the edge
/// schema changes, update this struct and `00_init.sql` together.
#[derive(Debug, Deserialize)]
struct AccessEvent {
    timestamp_ms: i64,
    status: String,           // "granted" | "unknown"
    employee_id: Option<i32>, // null for unknown faces
    distance: Option<f64>,    // null for unknown faces
    #[serde(default)]
    device_id: Option<String>, // not yet sent by the edge — accept it when it arrives
    /// Direction: "in" (entry) or "out" (exit). Edge does not yet
    /// publish this — default to "in" so existing producers keep working.
    #[serde(default = "default_direction")]
    direction: String,
}

fn default_direction() -> String {
    "in".to_string()
}

/// Connect to the broker, subscribe to the topics, spawn the polling task.
///
/// Returns the live MQTT state handle and the `AsyncClient` so HTTP
/// handlers can publish sync messages on enrollment / deletion. The
/// SUBSCRIBE requests are queued before returning; SUBACK and message
/// dispatch happen in the spawned task.
pub async fn start_subscriber(
    pool: PgPool,
    host: String,
    port: u16,
) -> anyhow::Result<(MqttStateHandle, AsyncClient)> {
    let mut opts = MqttOptions::new(CLIENT_ID, &host, port);
    opts.set_keep_alive(Duration::from_secs(30));
    // clean_session = false + stable client_id  =>  broker retains our
    // subscription and queues QoS-1 messages while the backend is offline.
    // This is what makes the "no event lost" guarantee real.
    opts.set_clean_session(false);

    let (client, eventloop) = AsyncClient::new(opts, 32);

    client.subscribe(TOPIC_ACCESS, QoS::AtLeastOnce).await?;
    client.subscribe(TOPIC_HEALTH, QoS::AtLeastOnce).await?;
    info!(
        "MQTT subscribed to '{}' and '{}' (broker {}:{})",
        TOPIC_ACCESS, TOPIC_HEALTH, host, port
    );

    // Shared state handle — return a clone so AppState can hold its own.
    let state: MqttStateHandle = Arc::new(RwLock::new(MqttState::default()));
    tokio::spawn(run_loop(pool, eventloop, state.clone()));
    Ok((state, client))
}

/// Forever-loop: poll the event loop, dispatch publishes, log everything else.
/// On connection errors, sleep briefly so we don't tight-loop on a downed broker.
async fn run_loop(pool: PgPool, mut eventloop: EventLoop, state: MqttStateHandle) {
    loop {
        match eventloop.poll().await {
            Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                // Broker accepted our connection. Mark the state alive
                // so /system/mqtt-status reflects reality.
                state.write().await.connected = true;
                info!("MQTT ConnAck — subscriber online");
            }
            Ok(Event::Incoming(Incoming::Publish(pkt))) => {
                // Touch last-seen on every inbound message (any topic).
                // It's the simplest "is the pipeline flowing?" signal.
                state.write().await.last_message_at_ms = Some(now_ms());
                if let Err(e) = handle_publish(&pool, &pkt.topic, &pkt.payload).await {
                    error!(
                        "MQTT message handling failed (topic={}): {:?}",
                        pkt.topic, e
                    );
                }
            }
            // ConnAck, SubAck, PingResp, outgoing packets — nothing for us to do.
            Ok(_) => {}
            Err(e) => {
                state.write().await.connected = false;
                warn!("MQTT connection error: {:?} — reconnecting in 5s", e);
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    }
}

async fn handle_publish(pool: &PgPool, topic: &str, payload: &[u8]) -> anyhow::Result<()> {
    if topic == TOPIC_ACCESS {
        let evt: AccessEvent = serde_json::from_slice(payload)?;

        // The DB CHECK constraint also enforces this, but failing here gives
        // a clearer log line than a Postgres constraint-violation error.
        if evt.status != "granted" && evt.status != "unknown" {
            warn!("dropping event with unexpected status: {}", evt.status);
            return Ok(());
        }
        if evt.direction != "in" && evt.direction != "out" {
            warn!("dropping event with unexpected direction: {}", evt.direction);
            return Ok(());
        }

        sqlx::query(
            r#"
            INSERT INTO access_events
                (employee_id, status, distance, timestamp_ms, device_id, direction)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(evt.employee_id)
        .bind(&evt.status)
        .bind(evt.distance)
        .bind(evt.timestamp_ms)
        .bind(evt.device_id.as_deref())
        .bind(&evt.direction)
        .execute(pool)
        .await?;

        info!(
            "access event stored: status={} dir={} employee_id={:?} distance={:?}",
            evt.status, evt.direction, evt.employee_id, evt.distance
        );
        return Ok(());
    }

    if topic.starts_with("facegate/health/") {
        debug!("health message on {}: {} bytes", topic, payload.len());
        // Heartbeat persistence is Phase 6 — log and move on.
        return Ok(());
    }

    debug!("ignored message on unexpected topic {}", topic);
    Ok(())
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
