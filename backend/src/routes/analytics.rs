//! Analytics endpoints. All require auth (Claims extractor).
//!
//! Endpoints:
//!   GET /analytics/access-by-hour    — 24-element bar chart input
//!   GET /analytics/events            — paginated access-event list with filters
//!   GET /analytics/avg-delay         — average lateness per employee
//!   GET /analytics/presence-heatmap  — 7×24 sparse grid for heatmap
//!   GET /analytics/summary-today     — 3 summary numbers for dashboard cards
//!
//! Timezone note: all hour/day-of-week grouping is done in São Paulo
//! local time. Without this, "today" in UTC vs SP would mis-bucket
//! events between 21:00–23:59 SP.

use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use tracing::error;

use super::AppState;
use super::auth::Claims;

const TZ: &str = "America/Sao_Paulo";

// ============================================================
// GET /analytics/access-by-hour
// ============================================================

#[derive(Serialize)]
pub struct HourCount {
    pub hour: i32,
    pub count: i64,
}

pub async fn access_by_hour(
    _claims: Claims,
    State(state): State<AppState>,
) -> Result<Json<Vec<HourCount>>, (StatusCode, &'static str)> {
    // SQL groups in SP local time. Returns sparse rows (only hours that
    // had events). We zero-fill on the Rust side so the frontend chart
    // always has 24 buckets.
    let rows: Vec<(i32, i64)> = sqlx::query_as::<_, (i32, i64)>(
        "SELECT
            EXTRACT(HOUR FROM to_timestamp(timestamp_ms / 1000.0) AT TIME ZONE $1)::int AS hour,
            COUNT(*)::bigint AS count
         FROM access_events
         GROUP BY hour
         ORDER BY hour",
    )
    .bind(TZ)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| {
        error!("access_by_hour db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    // Zero-fill to 24 hours.
    let mut counts = [0i64; 24];
    for (hour, count) in rows {
        if (0..24).contains(&hour) {
            counts[hour as usize] = count;
        }
    }
    let result: Vec<HourCount> = (0..24)
        .map(|h| HourCount {
            hour: h,
            count: counts[h as usize],
        })
        .collect();

    Ok(Json(result))
}

// ============================================================
// GET /analytics/events?employee_id=&from=&to=&limit=&offset=
// ============================================================

#[derive(Deserialize)]
pub struct EventsQuery {
    pub employee_id: Option<i32>,
    pub status: Option<String>,
    pub from: Option<i64>, // unix ms
    pub to: Option<i64>,   // unix ms
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct EventRow {
    pub id: i32,
    pub employee_name: Option<String>, // NULL when employee_id is NULL or employee was deleted
    pub status: String,
    pub distance: Option<f64>,
    pub timestamp_ms: i64,
}

pub async fn events(
    _claims: Claims,
    State(state): State<AppState>,
    Query(q): Query<EventsQuery>,
) -> Result<Json<Vec<EventRow>>, (StatusCode, &'static str)> {
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let offset = q.offset.unwrap_or(0).max(0);

    let rows = sqlx::query_as::<_, EventRow>(
        "SELECT
                e.id,
                emp.name AS employee_name,
                e.status,
                e.distance,
                e.timestamp_ms
             FROM access_events e
             LEFT JOIN employees emp ON e.employee_id = emp.id
             WHERE ($1::int    IS NULL OR e.employee_id  = $1)
               AND ($2::text   IS NULL OR e.status       = $2)
               AND ($3::bigint IS NULL OR e.timestamp_ms >= $3)
               AND ($4::bigint IS NULL OR e.timestamp_ms <= $4)
             ORDER BY e.timestamp_ms DESC
             LIMIT $5 OFFSET $6",
    )
    .bind(q.employee_id)
    .bind(q.status.as_deref())
    .bind(q.from)
    .bind(q.to)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| {
        error!("events db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    Ok(Json(rows))
}

// ============================================================
// GET /analytics/avg-delay
// ============================================================

#[derive(Serialize, sqlx::FromRow)]
pub struct AvgDelay {
    pub employee_id: i32,
    pub name: String,
    pub avg_delay_minutes: f64, // positive = late, negative = early
    pub days_observed: i64,
}

pub async fn avg_delay(
    _claims: Claims,
    State(state): State<AppState>,
) -> Result<Json<Vec<AvgDelay>>, (StatusCode, &'static str)> {
    // Hardcoded shift→start-time map (SP local time).
    // Future work: move this to a `shifts` table so HR can edit without code change.
    let rows = sqlx::query_as::<_, AvgDelay>(
        r#"
        WITH first_per_day AS (
            SELECT
                e.employee_id,
                DATE(to_timestamp(e.timestamp_ms / 1000.0) AT TIME ZONE $1) AS day,
                MIN(e.timestamp_ms) AS first_ms
            FROM access_events e
            WHERE e.status = 'granted' AND e.employee_id IS NOT NULL
            GROUP BY e.employee_id, day
        ),
        delays AS (
            SELECT
                f.employee_id,
                emp.name,
                EXTRACT(EPOCH FROM (
                    (to_timestamp(f.first_ms / 1000.0) AT TIME ZONE $1)::time
                    - CASE emp.shift
                        WHEN 'manhã' THEN TIME '08:00'
                        WHEN 'tarde' THEN TIME '14:00'
                        WHEN 'noite' THEN TIME '22:00'
                        ELSE NULL
                      END
                )) / 60.0 AS delay_min
            FROM first_per_day f
            JOIN employees emp ON emp.id = f.employee_id
            WHERE emp.shift IS NOT NULL
        )
        SELECT
            employee_id,
            name,
            COALESCE(AVG(delay_min), 0.0)::float8 AS avg_delay_minutes,
            COUNT(*)::bigint                       AS days_observed
        FROM delays
        GROUP BY employee_id, name
        ORDER BY avg_delay_minutes DESC NULLS LAST
        "#,
    )
    .bind(TZ)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| {
        error!("avg_delay db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    Ok(Json(rows))
}

// ============================================================
// GET /analytics/presence-heatmap
// ============================================================

#[derive(Serialize, sqlx::FromRow)]
pub struct HeatmapCell {
    pub day: i32,  // 0=Sunday … 6=Saturday (Postgres DOW convention)
    pub hour: i32, // 0..=23
    pub count: i64,
}

pub async fn presence_heatmap(
    _claims: Claims,
    State(state): State<AppState>,
) -> Result<Json<Vec<HeatmapCell>>, (StatusCode, &'static str)> {
    // Sparse output (only cells that have events). The heatmap library
    // on the frontend handles missing cells — we don't need to zero-fill
    // a 168-cell grid here.
    let rows = sqlx::query_as::<_, HeatmapCell>(
        "SELECT
            EXTRACT(DOW  FROM to_timestamp(timestamp_ms / 1000.0) AT TIME ZONE $1)::int AS day,
            EXTRACT(HOUR FROM to_timestamp(timestamp_ms / 1000.0) AT TIME ZONE $1)::int AS hour,
            COUNT(*)::bigint AS count
         FROM access_events
         WHERE status = 'granted'
         GROUP BY day, hour
         ORDER BY day, hour",
    )
    .bind(TZ)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| {
        error!("presence_heatmap db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    Ok(Json(rows))
}

// ============================================================
// GET /analytics/present-today
// ============================================================

/// One row per employee whose latest "in"-direction event today is
/// more recent than any "out"-direction event today.
///
/// Approximation note: until the edge starts publishing direction,
/// every event defaults to 'in', so this query effectively counts
/// "anyone with a granted entry today." Once exit events come online
/// the same query produces the correct presence list with no changes.
#[derive(Serialize, sqlx::FromRow)]
pub struct PresentEmployee {
    pub employee_id: i32,
    pub name: String,
    pub last_entry_ms: i64,
}

pub async fn present_today(
    _claims: Claims,
    State(state): State<AppState>,
) -> Result<Json<Vec<PresentEmployee>>, (StatusCode, &'static str)> {
    let rows = sqlx::query_as::<_, PresentEmployee>(
        r#"
        WITH today_in AS (
            SELECT employee_id, MAX(timestamp_ms) AS last_in
            FROM access_events
            WHERE status = 'granted'
              AND direction = 'in'
              AND employee_id IS NOT NULL
              AND DATE(to_timestamp(timestamp_ms / 1000.0) AT TIME ZONE $1)
                  = (NOW() AT TIME ZONE $1)::date
            GROUP BY employee_id
        ),
        today_out AS (
            SELECT employee_id, MAX(timestamp_ms) AS last_out
            FROM access_events
            WHERE status = 'granted'
              AND direction = 'out'
              AND employee_id IS NOT NULL
              AND DATE(to_timestamp(timestamp_ms / 1000.0) AT TIME ZONE $1)
                  = (NOW() AT TIME ZONE $1)::date
            GROUP BY employee_id
        )
        SELECT
            ti.employee_id            AS employee_id,
            emp.name                  AS name,
            ti.last_in                AS last_entry_ms
        FROM today_in ti
        JOIN employees emp ON emp.id = ti.employee_id
        LEFT JOIN today_out o ON o.employee_id = ti.employee_id
        WHERE o.last_out IS NULL OR o.last_out < ti.last_in
        ORDER BY ti.last_in DESC
        "#,
    )
    .bind(TZ)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| {
        error!("present_today db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    Ok(Json(rows))
}

// ============================================================
// GET /analytics/summary-today
// ============================================================

#[derive(Serialize, sqlx::FromRow)]
pub struct SummaryToday {
    pub total: i64,
    pub granted: i64,
    pub unknown: i64,
}

pub async fn summary_today(
    _claims: Claims,
    State(state): State<AppState>,
) -> Result<Json<SummaryToday>, (StatusCode, &'static str)> {
    let row = sqlx::query_as::<_, SummaryToday>(
        "WITH today AS (
            SELECT * FROM access_events
            WHERE DATE(to_timestamp(timestamp_ms / 1000.0) AT TIME ZONE $1)
                = (NOW() AT TIME ZONE $1)::date
         )
         SELECT
            COUNT(*)::bigint                                 AS total,
            COUNT(*) FILTER (WHERE status = 'granted')::bigint AS granted,
            COUNT(*) FILTER (WHERE status = 'unknown')::bigint AS unknown
         FROM today",
    )
    .bind(TZ)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        error!("summary_today db error: {:?}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, "db error")
    })?;

    Ok(Json(row))
}
