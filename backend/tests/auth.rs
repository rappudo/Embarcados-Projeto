//! Auth & JWT tests.
//!
//! Covers:
//!   * GET /health is open (no token required).
//!   * POST /auth/login succeeds with seeded admin creds.
//!   * POST /auth/login fails with wrong password (generic 401).
//!   * POST /auth/login fails for unknown email (same generic 401).
//!   * A protected endpoint (GET /employees) rejects missing/invalid
//!     tokens with 401, accepts a valid one with 200.

mod common;

use serde_json::json;

#[tokio::test]
async fn health_is_public() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    let resp = server.get("/health").await;
    resp.assert_status_ok();
    assert_eq!(resp.text(), "ok");
}

#[tokio::test]
async fn login_returns_token_for_seeded_admin() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    let resp = server
        .post("/auth/login")
        .json(&json!({ "email": "admin@facegate.local", "password": "admin123" }))
        .await;

    resp.assert_status_ok();
    let body: serde_json::Value = resp.json();
    let token = body["token"].as_str().expect("token field present");
    // JWTs are three base64url segments joined by '.'.
    assert_eq!(token.matches('.').count(), 2, "token shape: header.payload.sig");
}

#[tokio::test]
async fn login_rejects_wrong_password() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    let resp = server
        .post("/auth/login")
        .json(&json!({ "email": "admin@facegate.local", "password": "not the password" }))
        .await;

    resp.assert_status_unauthorized();
}

#[tokio::test]
async fn login_rejects_unknown_email() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    let resp = server
        .post("/auth/login")
        .json(&json!({ "email": "ghost@nowhere.local", "password": "anything" }))
        .await;

    // Same 401 as wrong-password: must not leak which field was wrong.
    resp.assert_status_unauthorized();
}

#[tokio::test]
async fn protected_endpoint_requires_token() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    // No Authorization header => 401.
    let resp = server.get("/employees").await;
    resp.assert_status_unauthorized();
}

#[tokio::test]
async fn protected_endpoint_rejects_malformed_token() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    let resp = server
        .get("/employees")
        .authorization_bearer("not-a-real-jwt")
        .await;
    resp.assert_status_unauthorized();
}

#[tokio::test]
async fn protected_endpoint_accepts_valid_token() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    let token = common::login_admin(&server).await;

    let resp = server
        .get("/employees")
        .authorization_bearer(&token)
        .await;
    resp.assert_status_ok();
    // Empty list (we truncated employees in reset_db).
    let body: serde_json::Value = resp.json();
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn expired_token_is_rejected() {
    // Sign a token whose `exp` is in the past. The Claims extractor uses
    // jsonwebtoken's `Validation::default()`, which enforces `exp` — so
    // even a structurally-valid token must be rejected once expired.
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    use jsonwebtoken::{EncodingKey, Header, encode};
    use serde::Serialize;

    #[derive(Serialize)]
    struct Claims {
        sub: i32,
        email: String,
        exp: usize,
    }

    // 10 minutes ago — well past any clock-skew tolerance.
    let exp = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        - 600) as usize;
    let token = encode(
        &Header::default(),
        &Claims {
            sub: 1,
            email: "admin@facegate.local".into(),
            exp,
        },
        &EncodingKey::from_secret(common::TEST_JWT_SECRET.as_bytes()),
    )
    .unwrap();

    let resp = server.get("/employees").authorization_bearer(&token).await;
    resp.assert_status_unauthorized();
}

#[tokio::test]
async fn token_signed_with_wrong_secret_is_rejected() {
    // A token forged against a different HS256 secret must fail signature
    // verification, regardless of how well-formed its claims are.
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    use jsonwebtoken::{EncodingKey, Header, encode};
    use serde::Serialize;

    #[derive(Serialize)]
    struct Claims {
        sub: i32,
        email: String,
        exp: usize,
    }

    // 1 hour into the future — claims are valid, but the signature isn't.
    let exp = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 3600) as usize;
    let token = encode(
        &Header::default(),
        &Claims {
            sub: 1,
            email: "admin@facegate.local".into(),
            exp,
        },
        &EncodingKey::from_secret(b"definitely-not-the-real-secret"),
    )
    .unwrap();

    let resp = server.get("/employees").authorization_bearer(&token).await;
    resp.assert_status_unauthorized();
}
