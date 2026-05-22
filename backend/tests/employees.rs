//! Employees CRUD tests.
//!
//! Exercises POST/GET/PATCH/DELETE on /employees. The DELETE handler
//! also publishes MQTT tombstones — those publishes go into the
//! non-polled rumqttc channel and don't affect the response.

mod common;

use serde_json::json;

#[tokio::test]
async fn list_returns_empty_when_no_employees() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server.get("/employees").authorization_bearer(&token).await;
    resp.assert_status_ok();
    let body: serde_json::Value = resp.json();
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn create_employee_succeeds() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Alice", "shift": "manhã" }))
        .await;

    assert_eq!(resp.status_code(), 201);
    let body: serde_json::Value = resp.json();
    assert_eq!(body["name"], "Alice");
    assert_eq!(body["shift"], "manhã");
    assert!(body["id"].as_i64().unwrap() > 0);
    assert!(body["created_at"].is_string());
}

#[tokio::test]
async fn create_employee_rejects_empty_name() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "   ", "shift": null }))
        .await;
    resp.assert_status_bad_request();
}

#[tokio::test]
async fn create_employee_accepts_null_shift() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Bob", "shift": null }))
        .await;

    assert_eq!(resp.status_code(), 201);
    let body: serde_json::Value = resp.json();
    assert!(body["shift"].is_null());
}

#[tokio::test]
async fn get_one_returns_employee() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let created = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Carol", "shift": "tarde" }))
        .await
        .json::<serde_json::Value>();
    let id = created["id"].as_i64().unwrap();

    let resp = server
        .get(&format!("/employees/{}", id))
        .authorization_bearer(&token)
        .await;
    resp.assert_status_ok();
    let body: serde_json::Value = resp.json();
    assert_eq!(body["name"], "Carol");
    assert_eq!(body["shift"], "tarde");
}

#[tokio::test]
async fn get_one_returns_404_for_missing_employee() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .get("/employees/9999")
        .authorization_bearer(&token)
        .await;
    resp.assert_status_not_found();
}

#[tokio::test]
async fn update_employee_partial() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let created = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Dave", "shift": "manhã" }))
        .await
        .json::<serde_json::Value>();
    let id = created["id"].as_i64().unwrap();

    // Only update name; shift should stay "manhã".
    let resp = server
        .patch(&format!("/employees/{}", id))
        .authorization_bearer(&token)
        .json(&json!({ "name": "David" }))
        .await;
    resp.assert_status_ok();
    let body: serde_json::Value = resp.json();
    assert_eq!(body["name"], "David");
    assert_eq!(body["shift"], "manhã");
}

#[tokio::test]
async fn update_employee_can_clear_shift_with_null() {
    // The handler uses a double-Option deserializer so {"shift": null}
    // means "set to NULL" while an absent field means "leave alone".
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let created = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Eve", "shift": "noite" }))
        .await
        .json::<serde_json::Value>();
    let id = created["id"].as_i64().unwrap();

    let resp = server
        .patch(&format!("/employees/{}", id))
        .authorization_bearer(&token)
        .json(&json!({ "shift": null }))
        .await;
    resp.assert_status_ok();
    let body: serde_json::Value = resp.json();
    assert_eq!(body["name"], "Eve");
    assert!(body["shift"].is_null());
}

#[tokio::test]
async fn update_employee_rejects_empty_name() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let created = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Frank" }))
        .await
        .json::<serde_json::Value>();
    let id = created["id"].as_i64().unwrap();

    let resp = server
        .patch(&format!("/employees/{}", id))
        .authorization_bearer(&token)
        .json(&json!({ "name": "   " }))
        .await;
    resp.assert_status_bad_request();
}

#[tokio::test]
async fn update_missing_employee_returns_404() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .patch("/employees/9999")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Ghost" }))
        .await;
    resp.assert_status_not_found();
}

#[tokio::test]
async fn delete_employee_succeeds() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let created = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Hank" }))
        .await
        .json::<serde_json::Value>();
    let id = created["id"].as_i64().unwrap();

    let resp = server
        .delete(&format!("/employees/{}", id))
        .authorization_bearer(&token)
        .await;
    assert_eq!(resp.status_code(), 204);

    // Confirm it's gone.
    let resp = server
        .get(&format!("/employees/{}", id))
        .authorization_bearer(&token)
        .await;
    resp.assert_status_not_found();
}

#[tokio::test]
async fn delete_missing_employee_returns_404() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .delete("/employees/9999")
        .authorization_bearer(&token)
        .await;
    resp.assert_status_not_found();
}

#[tokio::test]
async fn list_orders_by_name() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    for name in ["Charlie", "Alice", "Bob"] {
        server
            .post("/employees")
            .authorization_bearer(&token)
            .json(&json!({ "name": name }))
            .await
            .assert_status(axum::http::StatusCode::CREATED);
    }

    let body: serde_json::Value = server
        .get("/employees")
        .authorization_bearer(&token)
        .await
        .json();
    let names: Vec<&str> = body
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["Alice", "Bob", "Charlie"]);
}
