use axum::{Router, routing::get};
use sqlx::PgPool;

pub fn create_router(pool: PgPool) -> Router {
    Router::new().route("/health", get(health)).with_state(pool)
}

async fn health() -> &'static str {
    "ok"
}
