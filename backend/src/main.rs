use anyhow::Result;
use axum::http::{HeaderValue, Method};
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

mod config;
mod db;
mod models;
mod mqtt;
mod routes;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("backend=debug".parse()?),
        )
        .init();

    dotenvy::dotenv().ok();
    let config = config::Config::from_env()?;
    info!("Config carregado");

    let pool = db::connect(&config.database_url).await?;
    info!("Conectado ao PostgreSQL");

    // Start MQTT first. The eventloop runs in a spawned task, so this
    // returns quickly; we just need pool.clone() for the subscriber.
    // The returned handle exposes connection state to /system/mqtt-status,
    // and the AsyncClient lets HTTP handlers publish embedding-sync messages.
    let (mqtt_state, mqtt_client) =
        mqtt::start_subscriber(pool.clone(), config.mqtt_host.clone(), config.mqtt_port).await?;
    info!("MQTT subscriber spawned");

    // Configure strict CORS for the frontend
    let cors = CorsLayer::new()
        .allow_origin("http://localhost:8100".parse::<HeaderValue>().unwrap())
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(Any);

    // pool is moved into the router here — fine, no further uses.
    let app =
        routes::create_router(pool, config.jwt_secret, mqtt_state, mqtt_client).layer(cors);

    let addr = format!("0.0.0.0:{}", config.server_port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Servidor rodando em http://{}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
