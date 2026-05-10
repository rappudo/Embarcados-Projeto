//! Face embedding storage.
//!
//! Endpoints:
//!   POST /employees/:id/embeddings   — store a new 128-d vector
//!   GET  /employees/:id/embeddings   — fetch all vectors for an employee
//!
//! Used by the edge enrollment flow to upload MobileFaceNet outputs to
//! the backend. The edge runtime can also call GET to rebuild its local
//! SQLite cache after a reinstall (this is the "sync to edge" half of
//! Phase 4.5).

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::{DateTime, Utc};
use pgvector::Vector;
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use super::AppState;
use super::auth::Claims;

/// MobileFaceNet output dimension. Must match `embeddings.vector(128)`
/// in `00_init.sql` exactly.
const EMBEDDING_DIM: usize = 128;

// ---------- wire types ----------

#[derive(Deserialize)]
pub struct CreateEmbedding {
    pub vector: Vec<f32>,
}

#[derive(Serialize)]
pub struct EmbeddingResponse {
    pub id: i32,
    pub vector: Vec<f32>,
    pub created_at: DateTime<Utc>,
}

// ---------- DB row (internal) ----------

#[derive(sqlx::FromRow)]
struct EmbeddingRow {
    id: i32,
    vector: Vector,
    created_at: DateTime<Utc>,
}

impl From<EmbeddingRow> for EmbeddingResponse {
    fn from(r: EmbeddingRow) -> Self {
        Self {
            id: r.id,
            vector: r.vector.into(),
            created_at: r.created_at,
        }
    }
}

// ---------- POST /employees/:id/embeddings ----------

pub async fn create(
    _claims: Claims,
    State(state): State<AppState>,
    Path(employee_id): Path<i32>,
    Json(body): Json<CreateEmbedding>,
) -> Result<(StatusCode, Json<EmbeddingResponse>), (StatusCode, &'static str)> {
    if body.vector.len() != EMBEDDING_DIM {
        return Err((StatusCode::BAD_REQUEST, "vector must be exactly 128 floats"));
    }

    let vec = Vector::from(body.vector);

    let row = sqlx::query_as::<_, EmbeddingRow>(
        "INSERT INTO embeddings (employee_id, vector)
         VALUES ($1, $2)
         RETURNING id, vector, created_at",
    )
    .bind(employee_id)
    .bind(vec)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        // Foreign key violation = employee_id doesn't exist.
        // We map this to 404 instead of a generic 500 so the caller
        // gets a clear, actionable error.
        if let Some(db_err) = e.as_database_error() {
            if db_err.is_foreign_key_violation() {
                return (StatusCode::NOT_FOUND, "employee not found");
            }
        }
        error!("create embedding db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    info!(
        "embedding created: id={} for employee_id={}",
        row.id, employee_id
    );
    Ok((StatusCode::CREATED, Json(row.into())))
}

// ---------- GET /employees/:id/embeddings ----------

pub async fn list(
    _claims: Claims,
    State(state): State<AppState>,
    Path(employee_id): Path<i32>,
) -> Result<Json<Vec<EmbeddingResponse>>, (StatusCode, &'static str)> {
    // Explicit existence check so we can return 404 vs an empty list.
    // (Empty list is ambiguous: "no such employee" or "employee has
    // no enrolled face yet"? Better to distinguish.)
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM employees WHERE id = $1)")
        .bind(employee_id)
        .fetch_one(&state.pool)
        .await
        .map_err(|e| {
            error!("embeddings exists-check db error: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "db error")
        })?;

    if !exists {
        return Err((StatusCode::NOT_FOUND, "employee not found"));
    }

    let rows = sqlx::query_as::<_, EmbeddingRow>(
        "SELECT id, vector, created_at
         FROM embeddings
         WHERE employee_id = $1
         ORDER BY created_at DESC",
    )
    .bind(employee_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| {
        error!("list embeddings db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    Ok(Json(
        rows.into_iter().map(EmbeddingResponse::from).collect(),
    ))
}
