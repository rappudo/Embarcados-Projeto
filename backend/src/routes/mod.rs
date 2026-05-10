//! HTTP router composition.
//!
//! `AppState` holds everything handlers need (currently: DB pool +
//! JWT secret). Public routes are mounted as-is; protected routes
//! are protected by virtue of their handlers taking `Claims` as a
//! parameter (see `auth.rs`).

use axum::{
    Router,
    routing::{get, post},
};
use sqlx::PgPool;

pub mod auth;

/// Shared state passed to every handler via `State<AppState>`.
/// `Clone` is cheap: `PgPool` is internally `Arc`-backed and `String`
/// is cloned once per request.
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: String,
}

pub fn create_router(pool: PgPool, jwt_secret: String) -> Router {
    let state = AppState { pool, jwt_secret };

    Router::new()
        // ----- public routes -----
        .route("/health", get(health))
        .route("/auth/login", post(auth::login))
        // ----- protected routes -----
        // (added in 4.4 onwards. They take `claims: Claims` as a parameter
        //  and Axum's extractor system will 401 unauthenticated callers.)
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}
