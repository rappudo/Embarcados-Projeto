//! System status endpoints used by the panel's settings page.
//!
//!   GET /system/mqtt-status   — { connected: bool, last_message_at_ms: i64? }
//!
//! Reads from the shared `MqttStateHandle` published by the MQTT
//! subscriber task. The state is updated whenever the event loop sees
//! a ConnAck, an inbound Publish, or a transport error — so a fresh
//! HTTP read is always close to current.

use axum::{Json, extract::State};

use super::AppState;
use super::auth::Claims;
use crate::mqtt::MqttState;

/// GET /system/mqtt-status
pub async fn mqtt_status(
    _claims: Claims,
    State(state): State<AppState>,
) -> Json<MqttState> {
    // Cloning the small struct out from under the lock keeps the
    // critical section minimal.
    let snapshot = state.mqtt.read().await.clone();
    Json(snapshot)
}
