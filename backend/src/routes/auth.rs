//! JWT authentication.
//!
//! Exposes:
//! * `POST /auth/login` — exchanges email+password for a signed JWT.
//! * `Claims` — struct that doubles as an Axum extractor. Any handler
//!   that takes `claims: Claims` as a parameter is automatically
//!   auth-protected: missing/invalid token => 401 before the handler
//!   body runs.
//!
//! Password storage: SHA-256 hex (matches `00_init.sql` seed). For
//! production this should move to argon2/bcrypt with constant-time verify.

use axum::{
    Json,
    extract::{FromRequestParts, State},
    http::{StatusCode, header, request::Parts},
};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

use super::AppState;

/// 8-hour token lifetime — generous for a demo session, conservative
/// enough that a leaked token isn't catastrophic.
const TOKEN_TTL_SECS: u64 = 60 * 60 * 8;

// ----------------------------------------------------------------------
// JWT claims
// ----------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    /// User id (matches `users.id`).
    pub sub: i32,
    /// User email — handy for logging the actor without a DB lookup.
    pub email: String,
    /// Expiry as a unix timestamp (seconds).
    pub exp: usize,
}

/// Axum extractor: any handler taking `Claims` as a parameter is protected.
/// Missing header => 401, malformed => 401, expired/bad signature => 401.
#[axum::async_trait]
impl FromRequestParts<AppState> for Claims {
    type Rejection = (StatusCode, &'static str);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or((StatusCode::UNAUTHORIZED, "missing Authorization header"))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or((StatusCode::UNAUTHORIZED, "expected Bearer token"))?;

        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
            &Validation::default(), // verifies `exp` automatically
        )
        .map_err(|_| (StatusCode::UNAUTHORIZED, "invalid or expired token"))?;

        Ok(data.claims)
    }
}

// ----------------------------------------------------------------------
// POST /auth/login
// ----------------------------------------------------------------------

#[derive(Deserialize)]
pub struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    token: String,
}

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, &'static str)> {
    // Hash the submitted password (SHA-256 hex, matches the seeded admin).
    use std::fmt::Write;
    let mut hasher = Sha256::new();
    hasher.update(body.password.as_bytes());
    let digest = hasher.finalize();
    let mut hash_hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        write!(&mut hash_hex, "{:02x}", byte).expect("writing to String never fails");
    }
    // Single query: looks up by email AND verifies hash. If either is
    // wrong we get None and return a generic 401 (don't leak which one).
    let row: Option<(i32, String)> = sqlx::query_as::<_, (i32, String)>(
        "SELECT id, email FROM users WHERE email = $1 AND password_hash = $2",
    )
    .bind(&body.email)
    .bind(&hash_hex)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| {
        tracing::error!("login db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "internal error")
    })?;

    let (id, email) = row.ok_or_else(|| {
        warn!("login failed for email={}", body.email);
        (StatusCode::UNAUTHORIZED, "invalid credentials")
    })?;

    // Build the token.
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let claims = Claims {
        sub: id,
        email: email.clone(),
        exp: (now + TOKEN_TTL_SECS) as usize,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(|e| {
        tracing::error!("jwt encode failed: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "token signing failed")
    })?;

    info!("login ok: user_id={} email={}", id, email);
    Ok(Json(LoginResponse { token }))
}
