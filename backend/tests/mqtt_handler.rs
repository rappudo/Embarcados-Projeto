//! Tests for the MQTT subscriber's message handler.
//!
//! `backend::mqtt::handle_publish` is the function that turns an inbound
//! MQTT payload into a Postgres row. Exercising it directly bypasses the
//! broker entirely — we feed it synthetic JSON and assert the resulting
//! DB state. This covers the half of the system that the HTTP tests
//! can't reach.

mod common;

use backend::mqtt::handle_publish;
use serde_json::json;
use sqlx::Row;

const TOPIC: &str = "facegate/events/access";

async fn count_events(pool: &sqlx::PgPool) -> i64 {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM access_events")
        .fetch_one(pool)
        .await
        .unwrap();
    row.0
}

async fn insert_employee(pool: &sqlx::PgPool, name: &str) -> i32 {
    let row: (i32,) = sqlx::query_as(
        "INSERT INTO employees (name) VALUES ($1) RETURNING id",
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap();
    row.0
}

#[tokio::test]
async fn granted_event_is_inserted() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let emp_id = insert_employee(&pool, "Mqtt-Alice").await;

    let payload = json!({
        "timestamp_ms": 1_700_000_000_000_i64,
        "status": "granted",
        "employee_id": emp_id,
        "distance": 0.35,
        "device_id": "pi-01",
        "direction": "in",
    });
    handle_publish(&pool, TOPIC, &serde_json::to_vec(&payload).unwrap())
        .await
        .expect("handle_publish");

    let row = sqlx::query(
        "SELECT employee_id, status, distance, timestamp_ms, device_id, direction
         FROM access_events",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(row.get::<Option<i32>, _>("employee_id"), Some(emp_id));
    assert_eq!(row.get::<String, _>("status"), "granted");
    assert_eq!(row.get::<Option<f64>, _>("distance"), Some(0.35));
    assert_eq!(row.get::<i64, _>("timestamp_ms"), 1_700_000_000_000);
    assert_eq!(row.get::<Option<String>, _>("device_id"), Some("pi-01".into()));
    assert_eq!(row.get::<String, _>("direction"), "in");
}

#[tokio::test]
async fn unknown_face_event_has_null_employee_and_distance() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;

    let payload = json!({
        "timestamp_ms": 1_700_000_001_000_i64,
        "status": "unknown",
        "employee_id": null,
        "distance": null,
        "direction": "in",
    });
    handle_publish(&pool, TOPIC, &serde_json::to_vec(&payload).unwrap())
        .await
        .expect("handle_publish");

    let row = sqlx::query(
        "SELECT employee_id, status, distance FROM access_events",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(row.get::<Option<i32>, _>("employee_id").is_none());
    assert_eq!(row.get::<String, _>("status"), "unknown");
    assert!(row.get::<Option<f64>, _>("distance").is_none());
}

#[tokio::test]
async fn direction_defaults_to_in_when_missing() {
    // The edge is older than the schema migration that added `direction`
    // and doesn't publish the field yet. The Deserialize default keeps
    // legacy producers working.
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let emp_id = insert_employee(&pool, "Mqtt-Bob").await;

    let payload = json!({
        "timestamp_ms": 1_700_000_002_000_i64,
        "status": "granted",
        "employee_id": emp_id,
        "distance": 0.4,
        // no direction field
    });
    handle_publish(&pool, TOPIC, &serde_json::to_vec(&payload).unwrap())
        .await
        .expect("handle_publish");

    let row = sqlx::query("SELECT direction FROM access_events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(row.get::<String, _>("direction"), "in");
}

#[tokio::test]
async fn invalid_status_drops_silently() {
    // The handler also has a CHECK constraint backing it up at the DB
    // level, but the early-return in handle_publish saves a noisy
    // Postgres error in the logs when garbage arrives.
    let pool = common::pool().await;
    common::reset_db(&pool).await;

    let payload = json!({
        "timestamp_ms": 1_700_000_003_000_i64,
        "status": "blocked", // not in ('granted', 'unknown')
        "employee_id": null,
        "distance": null,
        "direction": "in",
    });
    handle_publish(&pool, TOPIC, &serde_json::to_vec(&payload).unwrap())
        .await
        .expect("handle_publish should return Ok even when dropping");

    assert_eq!(count_events(&pool).await, 0);
}

#[tokio::test]
async fn invalid_direction_drops_silently() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;

    let payload = json!({
        "timestamp_ms": 1_700_000_004_000_i64,
        "status": "granted",
        "employee_id": null,
        "distance": null,
        "direction": "sideways",
    });
    handle_publish(&pool, TOPIC, &serde_json::to_vec(&payload).unwrap())
        .await
        .expect("ok-drop on invalid direction");

    assert_eq!(count_events(&pool).await, 0);
}

#[tokio::test]
async fn malformed_json_returns_err() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;

    let result = handle_publish(&pool, TOPIC, b"not json").await;
    assert!(result.is_err(), "malformed JSON must error so the loop logs it");
    assert_eq!(count_events(&pool).await, 0);
}

#[tokio::test]
async fn health_topic_is_no_op() {
    // Subscribed to facegate/health/# but persistence is "Phase 6 — log
    // and move on". Test pins that behavior so future work doesn't
    // accidentally start writing rows on heartbeats.
    let pool = common::pool().await;
    common::reset_db(&pool).await;

    handle_publish(&pool, "facegate/health/pi-01", b"{\"uptime\": 42}")
        .await
        .expect("ok");
    assert_eq!(count_events(&pool).await, 0);
}

#[tokio::test]
async fn unknown_topic_is_no_op() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;

    handle_publish(&pool, "facegate/random/nonsense", b"anything")
        .await
        .expect("ok");
    assert_eq!(count_events(&pool).await, 0);
}

#[tokio::test]
async fn employee_id_pointing_to_deleted_employee_violates_fk() {
    // If the edge has a stale embedding for an employee that's been
    // deleted server-side, the resulting access event will reference a
    // missing employee. We want this to error (returned to the caller),
    // so the run loop logs it visibly.
    let pool = common::pool().await;
    common::reset_db(&pool).await;

    let payload = json!({
        "timestamp_ms": 1_700_000_005_000_i64,
        "status": "granted",
        "employee_id": 9999, // doesn't exist
        "distance": 0.4,
        "direction": "in",
    });
    let result = handle_publish(&pool, TOPIC, &serde_json::to_vec(&payload).unwrap()).await;
    assert!(result.is_err());
    assert_eq!(count_events(&pool).await, 0);
}
