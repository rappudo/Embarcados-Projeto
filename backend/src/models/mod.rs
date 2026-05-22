//! Domain models shared across handlers.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;

/// Mirrors the `employees` table from `00_init.sql`.
/// `shift` is nullable in the DB and exposed as `Option<String>` here.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, ToSchema)]
pub struct Employee {
    pub id: i32,
    pub name: String,
    #[schema(example = "manhã")]
    pub shift: Option<String>,
    pub created_at: DateTime<Utc>,
}
