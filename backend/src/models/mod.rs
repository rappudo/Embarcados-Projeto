//! Domain models shared across handlers.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Mirrors the `employees` table from `00_init.sql`.
/// `shift` is nullable in the DB and exposed as `Option<String>` here.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Employee {
    pub id: i32,
    pub name: String,
    pub shift: Option<String>,
    pub created_at: DateTime<Utc>,
}
