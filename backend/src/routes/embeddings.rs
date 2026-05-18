//! Face embedding storage.
//!
//! The backend never sees a face image. Embedding extraction runs in the
//! panel (browser) and on the edge device — both have physical access to
//! the face. This endpoint accepts the resulting 512-d vector and stores
//! it; the raw biometric never traverses the network.

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::{DateTime, Utc};
use pgvector::Vector;
use rumqttc::{AsyncClient, QoS};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

const SYNC_UPSERT_PREFIX: &str = "facegate/sync/embeddings/upsert";

use super::AppState;
use super::auth::Claims;

const EMBEDDING_DIM: usize = 512;

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

// ---------- MQTT sync payload (mirrors edge JSON parser) ----------

#[derive(Serialize)]
struct EmbeddingSyncMsg<'a> {
    embedding_id: i32,
    employee_id: i32,
    vector: &'a [f32],
    created_at_ms: i64,
}

/// Publish the embedding to facegate/sync/embeddings/upsert/{id} with
/// retain=true so any edge subscribing later receives the live state.
/// Best-effort: failure is logged but does not fail the HTTP request,
/// since Postgres is the source of truth and a reconciler can re-sync.
async fn publish_embedding_upsert(
    client: &AsyncClient,
    embedding_id: i32,
    employee_id: i32,
    vector: &[f32],
    created_at: DateTime<Utc>,
) {
    let topic = format!("{}/{}", SYNC_UPSERT_PREFIX, embedding_id);
    let payload = match serde_json::to_vec(&EmbeddingSyncMsg {
        embedding_id,
        employee_id,
        vector,
        created_at_ms: created_at.timestamp_millis(),
    }) {
        Ok(p) => p,
        Err(e) => {
            error!("failed to serialize embedding sync payload: {:?}", e);
            return;
        }
    };
    if let Err(e) = client
        .publish(&topic, QoS::AtLeastOnce, /*retain=*/ true, payload)
        .await
    {
        error!("MQTT publish to {} failed: {:?}", topic, e);
    } else {
        info!("MQTT sync published: {}", topic);
    }
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
        return Err((StatusCode::BAD_REQUEST, "vector must be exactly 512 floats"));
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

    let vector_slice: Vec<f32> = row.vector.clone().into();
    publish_embedding_upsert(
        &state.mqtt_client,
        row.id,
        employee_id,
        &vector_slice,
        row.created_at,
    )
    .await;

    Ok((StatusCode::CREATED, Json(row.into())))
}

// ---------- GET /employees/:id/embeddings ----------

pub async fn list(
    _claims: Claims,
    State(state): State<AppState>,
    Path(employee_id): Path<i32>,
) -> Result<Json<Vec<EmbeddingResponse>>, (StatusCode, &'static str)> {
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
