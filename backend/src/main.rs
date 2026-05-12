use anyhow::Result;
use tower_http::cors::CorsLayer;
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
    // The returned handle exposes connection state to /system/mqtt-status.
    let mqtt_state =
        mqtt::start_subscriber(pool.clone(), config.mqtt_host.clone(), config.mqtt_port).await?;
    info!("MQTT subscriber spawned");

    // pool is moved into the router here — fine, no further uses.
    let app = routes::create_router(pool, config.jwt_secret, mqtt_state)
        // CorsLayer::permissive() = allow any origin/method/header.
        // Fine for development. For production, restrict to specific origins.
        .layer(CorsLayer::permissive());

    let addr = format!("0.0.0.0:{}", config.server_port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Servidor rodando em http://{}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
