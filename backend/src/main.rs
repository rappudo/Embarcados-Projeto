use anyhow::{Context, Result};
use axum::http::{HeaderName, HeaderValue, Method, header};
use backend::{config, db, mqtt, routes};
use tower_http::cors::CorsLayer;
use tracing::info;

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
    let (mqtt_state, mqtt_client) = mqtt::start_subscriber(
        pool.clone(),
        config.mqtt_host.clone(),
        config.mqtt_port,
        config.mqtt_username.clone(),
        config.mqtt_password.clone(),
    )
    .await?;
    info!("MQTT subscriber spawned");

    // CORS allow-list from CORS_ORIGINS (.env). Defaults to the dev pair
    // (localhost / 127.0.0.1 on :8100) when the env var is absent; on EC2
    // it points at whatever public origin the panel is served from.
    let origins: Vec<HeaderValue> = config
        .cors_origins
        .iter()
        .map(|o| {
            o.parse::<HeaderValue>()
                .with_context(|| format!("CORS_ORIGINS contém valor inválido: '{}'", o))
        })
        .collect::<Result<_>>()?;
    info!("CORS allow-list: {:?}", config.cors_origins);

    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        // Explicit list, not `Any`. Per the CORS spec, the wildcard `*` in
        // Access-Control-Allow-Headers does NOT cover Authorization — it has
        // to be named. Firefox already warns about this in DevTools and
        // intends to enforce it soon, which would break every authenticated
        // request from the panel.
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            HeaderName::from_static("x-requested-with"),
        ]);

    // pool is moved into the router here — fine, no further uses.
    let app =
        routes::create_router(pool, config.jwt_secret, mqtt_state, mqtt_client).layer(cors);

    // [::] binds both IPv4 and IPv6 via IPv4-mapped IPv6 (Linux default).
    // 0.0.0.0 would leave `localhost` -> ::1 requests from browsers
    // dangling with ECONNREFUSED.
    let addr = format!("[::]:{}", config.server_port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Servidor rodando em http://{}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
