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
use rumqttc::AsyncClient;
use sqlx::PgPool;
use tower_http::services::ServeDir;
use utoipa::OpenApi;
use utoipa::openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme};
use utoipa_swagger_ui::SwaggerUi;

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
/// `AsyncClient` is also internally `Arc`-backed.
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: String,
    pub mqtt: MqttStateHandle,
    pub mqtt_client: AsyncClient,
}

pub fn create_router(
    pool: PgPool,
    jwt_secret: String,
    mqtt: MqttStateHandle,
    mqtt_client: AsyncClient,
) -> Router {
    let state = AppState {
        pool,
        jwt_secret,
        mqtt,
        mqtt_client,
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
        // ONNX models served as static assets for in-browser inference.
        // The face image never traverses the network — the panel runs
        // BlazeFace + ArcFace locally and only uploads the 512-d vector.
        .nest_service("/models", ServeDir::new("../edge/models"))
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
        // Apply state BEFORE merging the (stateless) SwaggerUi router —
        // `.merge()` requires both sides to have the same state type.
        .with_state(state)
        // ----- OpenAPI / Swagger UI -----
        // The JSON spec is generated from the `ApiDoc` derive below; the
        // UI is a static asset bundle shipped by utoipa-swagger-ui that
        // points at it. Both endpoints are open (no auth) so a teammate
        // can browse the API without a token. The interactive "Try it
        // out" buttons in Swagger will prompt for the bearer token via
        // the `securitySchemes` definition.
        .merge(
            SwaggerUi::new("/swagger-ui")
                .url("/api-docs/openapi.json", ApiDoc::openapi()),
        )
}

#[utoipa::path(
    get,
    path = "/health",
    tag = "system",
    responses(
        (status = 200, description = "Backend is alive. Open endpoint — no auth needed.", body = String),
    ),
)]
async fn health() -> &'static str {
    "ok"
}

// ----------------------------------------------------------------------
// OpenAPI root
// ----------------------------------------------------------------------

/// Top-level OpenAPI document. The `paths(...)` and `components(schemas(...))`
/// lists need to be kept in sync with the handlers — utoipa's derive
/// resolves the names at compile time, so a missing or renamed entry
/// fails the build with a clear error.
#[derive(OpenApi)]
#[openapi(
    info(
        title = "FaceGateway Backend",
        description = "REST API for the face-recognition access-control system. Authentication is JWT (HS256), 8h TTL; obtain a token via POST /auth/login and pass it as `Authorization: Bearer <token>` on every protected endpoint.",
    ),
    paths(
        health,
        auth::login,
        employees::list,
        employees::get_one,
        employees::create,
        employees::update,
        employees::delete,
        embeddings::list,
        embeddings::create,
        users::list,
        users::create,
        system::mqtt_status,
        analytics::access_by_hour,
        analytics::events,
        analytics::avg_delay,
        analytics::presence_heatmap,
        analytics::summary_today,
        analytics::present_today,
    ),
    components(schemas(
        crate::models::Employee,
        auth::LoginRequest,
        auth::LoginResponse,
        employees::CreateEmployee,
        employees::UpdateEmployee,
        embeddings::CreateEmbedding,
        embeddings::EmbeddingResponse,
        users::UserRow,
        users::CreateUser,
        crate::mqtt::MqttState,
        analytics::HourCount,
        analytics::EventRow,
        analytics::AvgDelay,
        analytics::HeatmapCell,
        analytics::PresentEmployee,
        analytics::SummaryToday,
    )),
    tags(
        (name = "auth", description = "Authentication"),
        (name = "employees", description = "Employee CRUD"),
        (name = "embeddings", description = "Face embedding storage (512-d ArcFace vectors)"),
        (name = "users", description = "Operator account management"),
        (name = "analytics", description = "Aggregated access analytics"),
        (name = "system", description = "Health, MQTT status"),
    ),
    modifiers(&BearerSecurity),
)]
pub struct ApiDoc;

/// Registers the `bearer_token` security scheme. Referenced by each
/// `#[utoipa::path(security(("bearer_token" = [])))]` annotation on
/// protected handlers so Swagger's "Authorize" button prompts for the
/// JWT and re-uses it across "Try it out" calls.
struct BearerSecurity;

impl utoipa::Modify for BearerSecurity {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi
            .components
            .as_mut()
            .expect("components present because at least one schema is registered");
        components.add_security_scheme(
            "bearer_token",
            SecurityScheme::Http(
                HttpBuilder::new()
                    .scheme(HttpAuthScheme::Bearer)
                    .bearer_format("JWT")
                    .build(),
            ),
        );
    }
}
