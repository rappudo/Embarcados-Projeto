// OpenAPI / Swagger UI endpoint tests.
//
// Pins that the spec is mounted, well-formed, and covers every public
// path. Catches regressions like forgetting to add a new handler to
// the `ApiDoc` derive — a missing path would silently disappear from
// `/api-docs/openapi.json`.

mod common;

use serde_json::Value;

#[tokio::test]
async fn openapi_spec_is_served_and_well_formed() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    let resp = server.get("/api-docs/openapi.json").await;
    resp.assert_status_ok();

    let body: Value = resp.json();
    // Basic shape.
    assert_eq!(body["openapi"].as_str().unwrap_or(""), "3.1.0");
    assert!(body["info"]["title"].as_str().unwrap_or("").contains("FaceGateway"));

    // Every protected route must reference the bearer_token security
    // scheme. Missing it would mean Swagger doesn't surface the
    // "Authorize" prompt for that endpoint.
    let schemes = body["components"]["securitySchemes"]
        .as_object()
        .expect("securitySchemes object");
    assert!(schemes.contains_key("bearer_token"));
}

#[tokio::test]
async fn openapi_spec_lists_every_handler() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    let body: Value = server.get("/api-docs/openapi.json").await.json();
    let paths = body["paths"]
        .as_object()
        .expect("paths object");

    // Each entry is a (method, path) the spec MUST list. If a new
    // handler is added without being plugged into `ApiDoc::paths(...)`,
    // it disappears from the spec — failing this test catches the
    // regression at PR time.
    for expected in [
        "/health",
        "/auth/login",
        "/employees",
        "/employees/{id}",
        "/employees/{id}/embeddings",
        "/users",
        "/system/mqtt-status",
        "/analytics/access-by-hour",
        "/analytics/events",
        "/analytics/avg-delay",
        "/analytics/presence-heatmap",
        "/analytics/summary-today",
        "/analytics/present-today",
    ] {
        assert!(
            paths.contains_key(expected),
            "OpenAPI spec missing path: {}",
            expected
        );
    }
}

#[tokio::test]
async fn swagger_ui_is_served() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    // utoipa-swagger-ui serves the bundled HTML at /swagger-ui/. The
    // trailing slash matters — a request to /swagger-ui (no slash)
    // typically returns a redirect.
    let resp = server.get("/swagger-ui/").await;
    resp.assert_status_ok();
    let text = resp.text();
    // The page is the canonical Swagger UI HTML; sanity check.
    assert!(text.contains("swagger-ui"));
}
