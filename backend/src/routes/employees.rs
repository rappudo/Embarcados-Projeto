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
use serde::Deserialize;
use tracing::{error, info};

use super::AppState;
use super::auth::Claims;
use crate::models::Employee;

// ---------- request bodies ----------

#[derive(Deserialize)]
pub struct CreateEmployee {
    pub name: String,
    pub shift: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateEmployee {
    pub name: Option<String>,
    pub shift: Option<String>,
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
///
/// COALESCE keeps the existing column value when a field is absent in
/// the payload (binds to NULL → COALESCE(NULL, col) = col). Limitation:
/// can't set `shift` to NULL through this endpoint.
pub async fn update(
    _claims: Claims,
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Json(body): Json<UpdateEmployee>,
) -> Result<Json<Employee>, (StatusCode, &'static str)> {
    if let Some(ref n) = body.name {
        if n.trim().is_empty() {
            return Err((StatusCode::BAD_REQUEST, "name cannot be empty"));
        }
    }

    let emp = sqlx::query_as::<_, Employee>(
        "UPDATE employees
         SET name  = COALESCE($2, name),
             shift = COALESCE($3, shift)
         WHERE id = $1
         RETURNING id, name, shift, created_at",
    )
    .bind(id)
    .bind(body.name.as_deref().map(str::trim))
    .bind(body.shift.as_deref())
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| {
        error!("update employee db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?
    .ok_or((StatusCode::NOT_FOUND, "employee not found"))?;

    info!("employee updated: id={}", emp.id);
    Ok(Json(emp))
}

/// DELETE /employees/:id
///
/// The DB schema does the heavy lifting:
///   * `embeddings.employee_id` ON DELETE CASCADE — face data is wiped.
///   * `access_events.employee_id` ON DELETE SET NULL — audit log preserved.
pub async fn delete(
    _claims: Claims,
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<StatusCode, (StatusCode, &'static str)> {
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

    info!("employee deleted: id={}", id);
    Ok(StatusCode::NO_CONTENT)
}
