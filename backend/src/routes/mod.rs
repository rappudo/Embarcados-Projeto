//! HTTP router composition.
//!
//! `AppState` holds everything handlers need (DB pool, JWT secret, the
//! shared MQTT subscriber state). Public routes are mounted as-is;
//! protected routes are protected by virtue of their handlers taking
//! `Claims` as a parameter (see `auth.rs`).

use axum::{
    Router,
    routing::{get, post},
};
use sqlx::PgPool;

pub mod analytics;
pub mod auth;
pub mod embeddings;
pub mod employees;
pub mod system;
pub mod users;

use crate::mqtt::MqttStateHandle;

/// Shared state passed to every handler via `State<AppState>`.
/// `Clone` is cheap: `PgPool` is internally `Arc`-backed, `String`
/// is cloned once per request, and the MQTT state is already an `Arc`.
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: String,
    pub mqtt: MqttStateHandle,
}

pub fn create_router(pool: PgPool, jwt_secret: String, mqtt: MqttStateHandle) -> Router {
    let state = AppState {
        pool,
        jwt_secret,
        mqtt,
    };

    Router::new()
        // ----- public routes -----
        .route("/health", get(health))
        .route("/auth/login", post(auth::login))
        // ----- employees CRUD (protected) -----
        .route("/employees", get(employees::list).post(employees::create))
        .route(
            "/employees/:id",
            get(employees::get_one)
                .patch(employees::update)
                .delete(employees::delete),
        )
        // ----- face embeddings (protected) -----
        .route(
            "/employees/:id/embeddings",
            get(embeddings::list).post(embeddings::create),
        )
        // Browser-driven enrollment (demo path — see embeddings::enroll docs).
        .route("/employees/:id/enroll", post(embeddings::enroll))
        // ----- users (protected, single-tier auth) -----
        .route("/users", get(users::list).post(users::create))
        // ----- system status (protected) -----
        .route("/system/mqtt-status", get(system::mqtt_status))
        // ----- analytics (protected) -----
        .route("/analytics/access-by-hour", get(analytics::access_by_hour))
        .route("/analytics/events", get(analytics::events))
        .route("/analytics/avg-delay", get(analytics::avg_delay))
        .route(
            "/analytics/presence-heatmap",
            get(analytics::presence_heatmap),
        )
        .route("/analytics/summary-today", get(analytics::summary_today))
        .route("/analytics/present-today", get(analytics::present_today))
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}
