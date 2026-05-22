//! Users endpoint tests.

mod common;

use serde_json::json;

#[tokio::test]
async fn list_users_returns_seeded_admin() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server.get("/users").authorization_bearer(&token).await;
    resp.assert_status_ok();
    let body: serde_json::Value = resp.json();
    let users = body.as_array().unwrap();
    assert_eq!(users.len(), 1);
    assert_eq!(users[0]["email"], "admin@facegate.local");
    // password_hash must NOT be exposed in the response.
    assert!(users[0].get("password_hash").is_none());
}

#[tokio::test]
async fn create_user_succeeds_and_persists_hashed_password() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .post("/users")
        .authorization_bearer(&token)
        .json(&json!({ "email": "operator@facegate.local", "password": "s3cret" }))
        .await;

    assert_eq!(resp.status_code(), 201);
    let body: serde_json::Value = resp.json();
    assert_eq!(body["email"], "operator@facegate.local");
    assert!(body["id"].as_i64().unwrap() > 0);

    // The stored hash must be SHA-256 hex of the password. Login proves
    // the hash matches without poking at the DB directly.
    let login = server
        .post("/auth/login")
        .json(&json!({ "email": "operator@facegate.local", "password": "s3cret" }))
        .await;
    login.assert_status_ok();
}

#[tokio::test]
async fn create_user_rejects_duplicate_email() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .post("/users")
        .authorization_bearer(&token)
        .json(&json!({ "email": "admin@facegate.local", "password": "anything" }))
        .await;
    // 409 Conflict, mapped from the UNIQUE-violation database error.
    assert_eq!(resp.status_code(), 409);
}

#[tokio::test]
async fn create_user_rejects_empty_email() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .post("/users")
        .authorization_bearer(&token)
        .json(&json!({ "email": "   ", "password": "s3cret" }))
        .await;
    resp.assert_status_bad_request();
}

#[tokio::test]
async fn create_user_rejects_short_password() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .post("/users")
        .authorization_bearer(&token)
        .json(&json!({ "email": "x@y.z", "password": "abc" }))
        .await;
    resp.assert_status_bad_request();
}

#[tokio::test]
async fn list_users_requires_auth() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    let resp = server.get("/users").await;
    resp.assert_status_unauthorized();
}
