//! Employee CRUD endpoints.
//!
//! All handlers take `_claims: Claims` as their first parameter, which
//! invokes the JWT extractor and short-circuits to 401 for anonymous
//! callers. The leading underscore is because we don't use the claim
//! values themselves — only the side effect of validating the token.

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use rumqttc::{AsyncClient, QoS};
use serde::{Deserialize, Deserializer};
use tracing::{error, info};

use super::AppState;
use super::auth::Claims;
use crate::models::Employee;

const SYNC_UPSERT_PREFIX: &str = "facegate/sync/embeddings/upsert";

/// Publish an empty retained message to `facegate/sync/embeddings/upsert/{id}`,
/// which clears the retention slot on the broker and signals subscribers to
/// drop the embedding. Best-effort.
async fn publish_embedding_tombstone(client: &AsyncClient, embedding_id: i32) {
    let topic = format!("{}/{}", SYNC_UPSERT_PREFIX, embedding_id);
    if let Err(e) = client
        .publish(&topic, QoS::AtLeastOnce, /*retain=*/ true, Vec::<u8>::new())
        .await
    {
        error!("MQTT tombstone publish to {} failed: {:?}", topic, e);
    } else {
        info!("MQTT tombstone published: {}", topic);
    }
}

// ---------- helpers ----------

/// Helper to distinguish between "missing field" (None) and "null value" (Some(None))
fn double_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Option::<T>::deserialize(de).map(Some)
}

// ---------- request bodies ----------

#[derive(Deserialize)]
pub struct CreateEmployee {
    pub name: String,
    pub shift: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateEmployee {
    pub name: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub shift: Option<Option<String>>,
}

// ---------- handlers ----------

/// GET /employees
pub async fn list(
    _claims: Claims,
    State(state): State<AppState>,
) -> Result<Json<Vec<Employee>>, (StatusCode, &'static str)> {
    let rows = sqlx::query_as::<_, Employee>(
        "SELECT id, name, shift, created_at FROM employees ORDER BY name",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| {
        error!("list employees db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    Ok(Json(rows))
}

/// GET /employees/:id
pub async fn get_one(
    _claims: Claims,
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<Json<Employee>, (StatusCode, &'static str)> {
    let emp = sqlx::query_as::<_, Employee>(
        "SELECT id, name, shift, created_at FROM employees WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| {
        error!("get employee db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?
    .ok_or((StatusCode::NOT_FOUND, "employee not found"))?;

    Ok(Json(emp))
}

/// POST /employees    body: {"name": "...", "shift": "manhã"|null}
pub async fn create(
    _claims: Claims,
    State(state): State<AppState>,
    Json(body): Json<CreateEmployee>,
) -> Result<(StatusCode, Json<Employee>), (StatusCode, &'static str)> {
    if body.name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "name is required"));
    }

    let emp = sqlx::query_as::<_, Employee>(
        "INSERT INTO employees (name, shift)
         VALUES ($1, $2)
         RETURNING id, name, shift, created_at",
    )
    .bind(body.name.trim())
    .bind(body.shift.as_deref())
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        error!("create employee db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    info!("employee created: id={} name={}", emp.id, emp.name);
    Ok((StatusCode::CREATED, Json(emp)))
}

/// PATCH /employees/:id    body: {"name"?: "...", "shift"?: "..."}
pub async fn update(
    _claims: Claims,
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Json(body): Json<UpdateEmployee>,
) -> Result<Json<Employee>, (StatusCode, &'static str)> {
    // 1. Fetch current record
    let mut emp = sqlx::query_as::<_, Employee>(
        "SELECT id, name, shift, created_at FROM employees WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| {
        error!("get employee db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?
    .ok_or((StatusCode::NOT_FOUND, "employee not found"))?;

    // 2. Apply modifications in memory
    if let Some(ref n) = body.name {
        if n.trim().is_empty() {
            return Err((StatusCode::BAD_REQUEST, "name cannot be empty"));
        }
        emp.name = n.trim().to_string();
    }

    // If shift is present in payload, overwrite (even if it is explicitly null)
    if let Some(s) = body.shift {
        emp.shift = s;
    }

    // 3. Save modifications back to DB without relying on COALESCE
    let updated_emp = sqlx::query_as::<_, Employee>(
        "UPDATE employees
         SET name = $2, shift = $3
         WHERE id = $1
         RETURNING id, name, shift, created_at",
    )
    .bind(id)
    .bind(&emp.name)
    .bind(&emp.shift)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        error!("update employee db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    info!("employee updated: id={}", updated_emp.id);
    Ok(Json(updated_emp))
}

/// DELETE /employees/:id
pub async fn delete(
    _claims: Claims,
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<StatusCode, (StatusCode, &'static str)> {
    // Capture embedding ids before the cascade fires; we'll tombstone them
    // on the broker after the DELETE so edges drop them from local SQLite.
    let embedding_ids: Vec<i32> =
        sqlx::query_scalar("SELECT id FROM embeddings WHERE employee_id = $1")
            .bind(id)
            .fetch_all(&state.pool)
            .await
            .map_err(|e| {
                error!("select embeddings for delete db error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "db error")
            })?;

    let res = sqlx::query("DELETE FROM employees WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|e| {
            error!("delete employee db error: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "db error")
        })?;

    if res.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "employee not found"));
    }

    for eid in embedding_ids {
        publish_embedding_tombstone(&state.mqtt_client, eid).await;
    }

    info!("employee deleted: id={}", id);
    Ok(StatusCode::NO_CONTENT)
}
