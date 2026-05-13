//! Face embedding storage.

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use chrono::{DateTime, Utc};
use pgvector::Vector;
use rumqttc::{AsyncClient, QoS};
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

const SYNC_UPSERT_PREFIX: &str = "facegate/sync/embeddings/upsert";

// --- NEW ML IMPORTS ---
use ndarray::Array4;
use ort::session::{Session, builder::GraphOptimizationLevel};
use ort::value::TensorRef;
use std::sync::{Mutex, OnceLock};

use super::AppState;
use super::auth::Claims;

const EMBEDDING_DIM: usize = 512;
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

// ---------- Global ONNX Session ----------

static ONNX_SESSION: OnceLock<Mutex<Session>> = OnceLock::new();

/// Lazy-loads the ONNX model into memory on the first enrollment.
fn get_session() -> Result<&'static Mutex<Session>, &'static str> {
    if let Some(s) = ONNX_SESSION.get() {
        return Ok(s);
    }

    info!("Carregando modelo ArcFace ONNX...");
    let model_path = "../edge/models/arc.onnx";

    let session = Session::builder()
        .map_err(|_| "Failed to build ONNX session")?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|_| "Failed to set optimization level")?
        .commit_from_file(model_path)
        .map_err(|_| "Failed to load ONNX model. Verify the file path!")?;

    let _ = ONNX_SESSION.set(Mutex::new(session));
    Ok(ONNX_SESSION.get().expect("session was just set"))
}

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

// ---------- POST /employees/:id/enroll ----------

#[derive(Deserialize)]
pub struct EnrollBody {
    pub image_base64: String,
}

pub async fn enroll(
    _claims: Claims,
    State(state): State<AppState>,
    Path(employee_id): Path<i32>,
    Json(body): Json<EnrollBody>,
) -> Result<(StatusCode, Json<EmbeddingResponse>), (StatusCode, &'static str)> {
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

    // Process the image through ONNX instead of the stub!
    let vector_data = generate_embedding_from_bytes(&image_bytes).map_err(|e| {
        error!("ONNX inference error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "AI model inference failed",
        )
    })?;

    let vec = Vector::from(vector_data);

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
        "Real AI embedding stored: id={} for employee_id={}",
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

// ---------- Real ONNX Inference Logic ----------

/// Decodes the image, resizes to 112x112, normalizes the RGB values,
/// and passes the tensor through the MobileFaceNet ONNX model.
fn generate_embedding_from_bytes(bytes: &[u8]) -> Result<Vec<f32>, &'static str> {
    // 1. Load and resize the image
    let img = image::load_from_memory(bytes).map_err(|_| "Failed to decode image bytes")?;
    let resized = img.resize_exact(112, 112, image::imageops::FilterType::Triangle);
    let rgb = resized.into_rgb8();

    // 2. Prepare the tensor [batch_size, height, width, channels] -> [1, 112, 112, 3] (NHWC)
    let mut input_tensor = Array4::<f32>::zeros((1, 112, 112, 3));
    for (x, y, pixel) in rgb.enumerate_pixels() {
        // Standard ArcFace normalization: (pixel_value - 127.5) / 127.5
        input_tensor[[0, y as usize, x as usize, 0]] = (pixel[0] as f32 - 127.5) / 127.5;
        input_tensor[[0, y as usize, x as usize, 1]] = (pixel[1] as f32 - 127.5) / 127.5;
        input_tensor[[0, y as usize, x as usize, 2]] = (pixel[2] as f32 - 127.5) / 127.5;
    }

    // 3. Run the ONNX Session
    let session_lock = get_session()?;
    let mut session = session_lock
        .lock()
        .map_err(|_| "ONNX session mutex poisoned")?;

    let input_value =
        TensorRef::from_array_view(&input_tensor).map_err(|_| "Failed to build input tensor")?;

    // `name()` returns `&str` borrowed from `session`; `.to_string()` makes it owned
    // so the immutable borrow is released before we call `session.run(..)` below.
    let expected_input_name = session.inputs()[0].name().to_string();

    tracing::info!(
        "The model expects the input name to be: {}",
        expected_input_name
    );

    // Pass the cloned name into the macro
    let outputs = session
        .run(ort::inputs![expected_input_name.as_str() => input_value])
        .map_err(|e| {
            tracing::error!("ONNX Run Error details: {:?}", e);
            "Model execution failed"
        })?;

    // 4. Extract the 512-d output vector
    let (_shape, output_data) = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|_| "Failed to extract output tensor")?;

    let vec: Vec<f32> = output_data.to_vec();

    if vec.len() != EMBEDDING_DIM {
        return Err("Model output dimension mismatch. Expected 512.");
    }

    Ok(vec)
}
