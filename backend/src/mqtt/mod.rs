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

use rumqttc::{AsyncClient, Event, EventLoop, Incoming, MqttOptions, QoS};
use serde::Deserialize;
use sqlx::PgPool;
use std::time::Duration;
use tracing::{debug, error, info, warn};

const CLIENT_ID: &str = "facegate-backend";
const TOPIC_ACCESS: &str = "facegate/events/access";
const TOPIC_HEALTH: &str = "facegate/health/#";

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
}

/// Connect to the broker, subscribe to the topics, spawn the polling task.
///
/// Returns as soon as the SUBSCRIBE requests are queued. The actual
/// SUBACK and message dispatch happen in the background task.
pub async fn start_subscriber(pool: PgPool, host: String, port: u16) -> anyhow::Result<()> {
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

    tokio::spawn(run_loop(pool, eventloop));
    Ok(())
}

/// Forever-loop: poll the event loop, dispatch publishes, log everything else.
/// On connection errors, sleep briefly so we don't tight-loop on a downed broker.
async fn run_loop(pool: PgPool, mut eventloop: EventLoop) {
    loop {
        match eventloop.poll().await {
            Ok(Event::Incoming(Incoming::Publish(pkt))) => {
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

        sqlx::query(
            r#"
            INSERT INTO access_events
                (employee_id, status, distance, timestamp_ms, device_id)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(evt.employee_id)
        .bind(&evt.status)
        .bind(evt.distance)
        .bind(evt.timestamp_ms)
        .bind(evt.device_id.as_deref())
        .execute(pool)
        .await?;

        info!(
            "access event stored: status={} employee_id={:?} distance={:?}",
            evt.status, evt.employee_id, evt.distance
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
