//! User management endpoints.
//!
//!   GET  /users       — list all users (id, email, created_at)
//!   POST /users       — create a new user (body: {email, password})
//!
//! Both routes require auth (Claims extractor). There is no role / tier
//! split yet — any logged-in operator can create more users. That's a
//! deliberate single-tier choice; revisit when the app needs RBAC.
//!
//! Password hashing: SHA-256 hex, matching the seed in `00_init.sql`.
//! NOT cryptographically appropriate for production — for the demo it
//! keeps the hash format consistent with the existing user row.

use axum::{
    Json,
    extract::State,
    http::StatusCode,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tracing::{error, info};
use utoipa::ToSchema;

use super::AppState;
use super::auth::Claims;

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct UserRow {
    pub id: i32,
    pub email: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateUser {
    #[schema(example = "operator@facegate.local")]
    pub email: String,
    /// At least 4 characters. Hashed server-side (SHA-256 hex).
    pub password: String,
}

/// GET /users
#[utoipa::path(
    get,
    path = "/users",
    tag = "users",
    security(("bearer_token" = [])),
    responses(
        (status = 200, description = "All operator accounts, oldest first", body = Vec<UserRow>),
        (status = 401, description = "Missing or invalid Authorization header"),
    ),
)]
pub async fn list(
    _claims: Claims,
    State(state): State<AppState>,
) -> Result<Json<Vec<UserRow>>, (StatusCode, &'static str)> {
    let rows = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, created_at FROM users ORDER BY created_at",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| {
        error!("list users db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    Ok(Json(rows))
}

/// POST /users    body: {"email": "...", "password": "..."}
#[utoipa::path(
    post,
    path = "/users",
    tag = "users",
    security(("bearer_token" = [])),
    request_body = CreateUser,
    responses(
        (status = 201, description = "User created", body = UserRow),
        (status = 400, description = "Empty email or password < 4 chars"),
        (status = 401, description = "Missing or invalid Authorization header"),
        (status = 409, description = "Email already registered"),
    ),
)]
pub async fn create(
    _claims: Claims,
    State(state): State<AppState>,
    Json(body): Json<CreateUser>,
) -> Result<(StatusCode, Json<UserRow>), (StatusCode, &'static str)> {
    // Trivial validation — the DB UNIQUE constraint catches duplicates,
    // but giving a clearer 400 here saves a round-trip if the client
    // sends a blatantly empty payload.
    if body.email.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "email is required"));
    }
    if body.password.len() < 4 {
        return Err((StatusCode::BAD_REQUEST, "password must be ≥ 4 chars"));
    }

    let hash_hex = sha256_hex(body.password.as_bytes());

    let row = sqlx::query_as::<_, UserRow>(
        "INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, created_at",
    )
    .bind(body.email.trim())
    .bind(&hash_hex)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        if let Some(db_err) = e.as_database_error()
            && db_err.is_unique_violation()
        {
            return (StatusCode::CONFLICT, "email already registered");
        }
        error!("create user db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    info!("user created: id={} email={}", row.id, row.email);
    Ok((StatusCode::CREATED, Json(row)))
}

fn sha256_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        // Hex formatting can't fail when writing to a String.
        write!(&mut out, "{:02x}", byte).unwrap();
    }
    out
}
