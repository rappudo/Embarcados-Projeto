//! Face embedding storage.
//!
//! Endpoints:
//!   POST /employees/:id/embeddings   — store a new 128-d vector
//!   GET  /employees/:id/embeddings   — fetch all vectors for an employee
//!   POST /employees/:id/enroll       — accept an image, derive an embedding,
//!                                       store it. Demo-grade.
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
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use chrono::{DateTime, Utc};
use pgvector::Vector;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tracing::{error, info, warn};

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

// ---------- POST /employees/:id/enroll ----------

/// Reject payloads larger than this. A 5MB base64 string decodes to
/// ~3.7MB of raw bytes, which is generous for an enrollment photo.
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

#[derive(Deserialize)]
pub struct EnrollBody {
    /// Raw base64 (data URLs allowed; we strip the prefix).
    pub image_base64: String,
}

/// POST /employees/:id/enroll
///
/// Demo path: accepts a base64-encoded image from the panel's browser
/// webcam, derives a *deterministic stub* 128-d embedding from a hash
/// of the image bytes, and stores it in `embeddings`. The wire format
/// and side effects match the real edge enrollment, so the rest of the
/// stack works unchanged.
///
/// FIXME: stub embedding — replace with real ONNX inference.
///   To do this properly, swap out `stub_embedding_from_bytes` for an
///   `ort` (Rust ONNX Runtime) session running MobileFaceNet against
///   the decoded image. The model file is the same one the edge uses
///   (`edge/models/mobilefacenet.onnx`). The vector dimension must
///   stay at 128 to match the DB schema.
pub async fn enroll(
    _claims: Claims,
    State(state): State<AppState>,
    Path(employee_id): Path<i32>,
    Json(body): Json<EnrollBody>,
) -> Result<(StatusCode, Json<EmbeddingResponse>), (StatusCode, &'static str)> {
    // Tolerate "data:image/...;base64," prefixes the browser produces
    // from canvas.toDataURL().
    let b64 = body
        .image_base64
        .split(",")
        .last()
        .unwrap_or(&body.image_base64);

    let image_bytes = B64.decode(b64.trim()).map_err(|_| {
        warn!("enroll: invalid base64 payload");
        (StatusCode::BAD_REQUEST, "invalid base64 image")
    })?;

    if image_bytes.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "empty image"));
    }
    if image_bytes.len() > MAX_IMAGE_BYTES {
        return Err((StatusCode::PAYLOAD_TOO_LARGE, "image too large (max 5MB)"));
    }

    let vec = Vector::from(stub_embedding_from_bytes(&image_bytes));

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
        if let Some(db_err) = e.as_database_error() {
            if db_err.is_foreign_key_violation() {
                return (StatusCode::NOT_FOUND, "employee not found");
            }
        }
        error!("enroll db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    info!(
        "enroll stub-embedding stored: id={} for employee_id={} from {} image bytes",
        row.id,
        employee_id,
        image_bytes.len()
    );
    Ok((StatusCode::CREATED, Json(row.into())))
}

/// Produce a deterministic 128-d vector from arbitrary input bytes.
///
/// We hash the input with SHA-256 (32 bytes), then expand to 128 floats
/// by re-hashing each 8-byte chunk and unpacking as 4 little-endian
/// f32s normalised into [-1, 1]. The result has no relationship to
/// face features — the wizard, the DB write, and the response shape
/// all behave identically to the real pipeline, but matching against
/// these vectors will never find anyone. Adequate for the demo only.
fn stub_embedding_from_bytes(bytes: &[u8]) -> Vec<f32> {
    let seed = Sha256::digest(bytes);
    let mut out = Vec::with_capacity(128);
    for chunk_idx in 0..32u32 {
        // Re-hash (seed || chunk_idx) so each chunk depends on all input.
        let mut h = Sha256::new();
        h.update(seed);
        h.update(chunk_idx.to_le_bytes());
        let block = h.finalize();
        for i in 0..4 {
            let start = i * 4;
            let raw = u32::from_le_bytes([
                block[start],
                block[start + 1],
                block[start + 2],
                block[start + 3],
            ]);
            // Map to [-1, 1] for plausibility in cosine-distance space.
            let v = (raw as f32 / u32::MAX as f32) * 2.0 - 1.0;
            out.push(v);
        }
    }
    debug_assert_eq!(out.len(), EMBEDDING_DIM);
    out
}
