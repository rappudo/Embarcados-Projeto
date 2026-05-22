//! Analytics endpoint tests.
//!
//! The analytics SQL is the most complex code in the backend: timezone
//! bucketing, day-of-week extraction, and the avg-delay normalization
//! that maps raw time deltas into a (-12h, +12h] window. These tests
//! seed synthetic `access_events` at known SP-local timestamps and
//! assert the aggregated output.

mod common;

use chrono::Datelike;
use serde_json::Value;

// ============================================================
// GET /analytics/access-by-hour
// ============================================================

#[tokio::test]
async fn access_by_hour_zero_fills_and_buckets_by_sp_hour() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Hourly", None).await;

    // 2 events in SP-hour 9, 3 in hour 14, 1 in hour 22.
    for &minute in &[0_u32, 30] {
        common::insert_event(&pool, Some(emp), "granted", "in",
            common::sp_today_at(9, minute)).await;
    }
    for &minute in &[0_u32, 20, 45] {
        common::insert_event(&pool, Some(emp), "granted", "in",
            common::sp_today_at(14, minute)).await;
    }
    common::insert_event(&pool, Some(emp), "granted", "in",
        common::sp_today_at(22, 5)).await;

    let body: Value = server
        .get("/analytics/access-by-hour")
        .authorization_bearer(&token)
        .await
        .json();
    let arr = body.as_array().unwrap();
    // Always 24 entries, even for hours with zero events.
    assert_eq!(arr.len(), 24);

    let by_hour: std::collections::HashMap<i64, i64> = arr
        .iter()
        .map(|e| (e["hour"].as_i64().unwrap(), e["count"].as_i64().unwrap()))
        .collect();
    assert_eq!(by_hour[&9], 2);
    assert_eq!(by_hour[&14], 3);
    assert_eq!(by_hour[&22], 1);
    // Spot-check a quiet hour.
    assert_eq!(by_hour[&3], 0);
}

// ============================================================
// GET /analytics/summary-today
// ============================================================

#[tokio::test]
async fn summary_today_only_counts_today_and_splits_by_status() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Summary", None).await;
    let yesterday = common::sp_today().pred_opt().unwrap();

    // 3 granted + 2 unknown today
    for h in [8_u32, 9, 10] {
        common::insert_event(&pool, Some(emp), "granted", "in",
            common::sp_today_at(h, 0)).await;
    }
    for h in [11_u32, 12] {
        common::insert_event(&pool, None, "unknown", "in",
            common::sp_today_at(h, 0)).await;
    }
    // 1 granted yesterday — must NOT be counted.
    common::insert_event(&pool, Some(emp), "granted", "in",
        common::sp_ms(yesterday, 9, 0)).await;

    let body: Value = server
        .get("/analytics/summary-today")
        .authorization_bearer(&token)
        .await
        .json();
    assert_eq!(body["total"].as_i64().unwrap(), 5);
    assert_eq!(body["granted"].as_i64().unwrap(), 3);
    assert_eq!(body["unknown"].as_i64().unwrap(), 2);
}

// ============================================================
// GET /analytics/present-today
// ============================================================

#[tokio::test]
async fn present_today_tracks_latest_in_vs_out() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let a = common::insert_employee_with_shift(&pool, "Present-A", None).await;
    let b = common::insert_employee_with_shift(&pool, "Present-B", None).await;
    let c = common::insert_employee_with_shift(&pool, "Present-C", None).await;
    let d = common::insert_employee_with_shift(&pool, "Present-D", None).await;

    // A: in @ 09:00 — present.
    common::insert_event(&pool, Some(a), "granted", "in", common::sp_today_at(9, 0)).await;

    // B: in @ 08:00, out @ 17:00 — NOT present.
    common::insert_event(&pool, Some(b), "granted", "in", common::sp_today_at(8, 0)).await;
    common::insert_event(&pool, Some(b), "granted", "out", common::sp_today_at(17, 0)).await;

    // C: in @ 08:00, out @ 12:00, in @ 13:00 — present (latest is in).
    common::insert_event(&pool, Some(c), "granted", "in", common::sp_today_at(8, 0)).await;
    common::insert_event(&pool, Some(c), "granted", "out", common::sp_today_at(12, 0)).await;
    common::insert_event(&pool, Some(c), "granted", "in", common::sp_today_at(13, 0)).await;

    // D: in yesterday only — NOT present today.
    let yesterday = common::sp_today().pred_opt().unwrap();
    common::insert_event(&pool, Some(d), "granted", "in", common::sp_ms(yesterday, 9, 0)).await;

    let body: Value = server
        .get("/analytics/present-today")
        .authorization_bearer(&token)
        .await
        .json();
    let rows = body.as_array().unwrap();
    let names: std::collections::HashSet<&str> = rows
        .iter()
        .map(|r| r["name"].as_str().unwrap())
        .collect();
    assert!(names.contains("Present-A"));
    assert!(names.contains("Present-C"));
    assert!(!names.contains("Present-B"));
    assert!(!names.contains("Present-D"));
    assert_eq!(rows.len(), 2);
}

// ============================================================
// GET /analytics/avg-delay
// ============================================================

#[tokio::test]
async fn avg_delay_morning_shift_basic() {
    // 'manhã' starts at 08:00 SP. Events at 08:00 and 08:30 should
    // average to a 15-minute delay.
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Manha-Punctual", Some("manhã")).await;

    // Use specific past dates so we're independent of "today".
    let d1 = common::sp_today().pred_opt().unwrap().pred_opt().unwrap(); // 2 days ago
    let d2 = d1.pred_opt().unwrap(); // 3 days ago

    common::insert_event(&pool, Some(emp), "granted", "in", common::sp_ms(d1, 8, 0)).await;
    common::insert_event(&pool, Some(emp), "granted", "in", common::sp_ms(d2, 8, 30)).await;

    let body: Value = server
        .get("/analytics/avg-delay")
        .authorization_bearer(&token)
        .await
        .json();
    let arr = body.as_array().unwrap();
    let row = arr
        .iter()
        .find(|r| r["name"] == "Manha-Punctual")
        .expect("employee in result");
    assert_eq!(row["days_observed"].as_i64().unwrap(), 2);
    let avg = row["avg_delay_minutes"].as_f64().unwrap();
    assert!((avg - 15.0).abs() < 0.001, "expected 15 min, got {}", avg);
}

#[tokio::test]
async fn avg_delay_ignores_out_direction() {
    // The SQL filters direction='in' explicitly because exit events
    // were producing spurious MIN values per day. This test pins that
    // behavior: an early 'out' must NOT pull the average toward zero.
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Manha-Out", Some("manhã")).await;
    let day = common::sp_today().pred_opt().unwrap();

    // 06:00 out (should be ignored) + 08:30 in.
    common::insert_event(&pool, Some(emp), "granted", "out", common::sp_ms(day, 6, 0)).await;
    common::insert_event(&pool, Some(emp), "granted", "in", common::sp_ms(day, 8, 30)).await;

    let body: Value = server
        .get("/analytics/avg-delay")
        .authorization_bearer(&token)
        .await
        .json();
    let row = body
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["name"] == "Manha-Out")
        .expect("row");
    let avg = row["avg_delay_minutes"].as_f64().unwrap();
    assert!((avg - 30.0).abs() < 0.001, "expected 30 min (in-only), got {}", avg);
}

#[tokio::test]
async fn avg_delay_noite_post_midnight_arrival_normalized_positive() {
    // The killer case from the SQL comment: a 'noite' employee whose
    // first event of the day is at 00:30 SP. Naively the delta is
    // 00:30 - 22:00 = -77400 s = -1290 min (early!), but the modular
    // normalization wraps it to +150 min (late).
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Noite-Late", Some("noite")).await;
    let day = common::sp_today().pred_opt().unwrap();

    common::insert_event(&pool, Some(emp), "granted", "in", common::sp_ms(day, 0, 30)).await;

    let body: Value = server
        .get("/analytics/avg-delay")
        .authorization_bearer(&token)
        .await
        .json();
    let row = body
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["name"] == "Noite-Late")
        .expect("row");
    let avg = row["avg_delay_minutes"].as_f64().unwrap();
    assert!(
        (avg - 150.0).abs() < 0.001,
        "00:30 entry vs 22:00 shift should be +150 min, got {}",
        avg
    );
}

#[tokio::test]
async fn avg_delay_noite_just_after_shift_start() {
    // Sanity check the simpler 'noite' case: 22:30 entry → +30 min.
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Noite-Punctual", Some("noite")).await;
    let day = common::sp_today().pred_opt().unwrap();

    common::insert_event(&pool, Some(emp), "granted", "in", common::sp_ms(day, 22, 30)).await;

    let body: Value = server
        .get("/analytics/avg-delay")
        .authorization_bearer(&token)
        .await
        .json();
    let row = body
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["name"] == "Noite-Punctual")
        .expect("row");
    let avg = row["avg_delay_minutes"].as_f64().unwrap();
    assert!((avg - 30.0).abs() < 0.001, "expected +30 min, got {}", avg);
}

#[tokio::test]
async fn avg_delay_excludes_employees_with_null_shift() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Shift-Null", None).await;
    let day = common::sp_today().pred_opt().unwrap();
    common::insert_event(&pool, Some(emp), "granted", "in", common::sp_ms(day, 9, 0)).await;

    let body: Value = server
        .get("/analytics/avg-delay")
        .authorization_bearer(&token)
        .await
        .json();
    assert!(
        body.as_array()
            .unwrap()
            .iter()
            .all(|r| r["name"] != "Shift-Null"),
        "employees without a shift have no defined start time and must be excluded"
    );
}

// ============================================================
// GET /analytics/presence-heatmap
// ============================================================

#[tokio::test]
async fn presence_heatmap_groups_by_dow_and_hour_and_filters_status() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Heatmap-Hero", None).await;

    // Anchor on a date a couple of weeks ago so the data is stable and
    // unaffected by what "today" is.
    let anchor = common::sp_today().pred_opt().unwrap().pred_opt().unwrap();
    // anchor's day-of-week according to Postgres EXTRACT(DOW): 0=Sun..6=Sat.
    // Chrono's NaiveDate::weekday() uses 0=Mon..6=Sun, so map it.
    let dow_anchor: i32 = match anchor.weekday() {
        chrono::Weekday::Sun => 0,
        chrono::Weekday::Mon => 1,
        chrono::Weekday::Tue => 2,
        chrono::Weekday::Wed => 3,
        chrono::Weekday::Thu => 4,
        chrono::Weekday::Fri => 5,
        chrono::Weekday::Sat => 6,
    };

    // 2 granted events at hour 10 on `anchor`; 1 granted at hour 15 on
    // `anchor + 1`; 1 unknown at hour 10 on `anchor` (must be excluded).
    common::insert_event(&pool, Some(emp), "granted", "in", common::sp_ms(anchor, 10, 0)).await;
    common::insert_event(&pool, Some(emp), "granted", "in", common::sp_ms(anchor, 10, 30)).await;
    let anchor_plus_1 = anchor.succ_opt().unwrap();
    let dow_plus_1 = (dow_anchor + 1) % 7;
    common::insert_event(&pool, Some(emp), "granted", "in", common::sp_ms(anchor_plus_1, 15, 0)).await;
    common::insert_event(&pool, None, "unknown", "in", common::sp_ms(anchor, 10, 5)).await;

    let body: Value = server
        .get("/analytics/presence-heatmap")
        .authorization_bearer(&token)
        .await
        .json();

    let by_cell: std::collections::HashMap<(i64, i64), i64> = body
        .as_array()
        .unwrap()
        .iter()
        .map(|r| ((r["day"].as_i64().unwrap(), r["hour"].as_i64().unwrap()), r["count"].as_i64().unwrap()))
        .collect();

    assert_eq!(by_cell.get(&(dow_anchor as i64, 10)).copied(), Some(2));
    assert_eq!(by_cell.get(&(dow_plus_1 as i64, 15)).copied(), Some(1));
    // The unknown event landed on the same cell as the two granted ones
    // but must NOT have inflated the count.
}

// ============================================================
// GET /analytics/events  (filters + pagination)
// ============================================================

#[tokio::test]
async fn events_returns_newest_first() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Order", None).await;
    common::insert_event(&pool, Some(emp), "granted", "in", 1_000).await;
    common::insert_event(&pool, Some(emp), "granted", "in", 3_000).await;
    common::insert_event(&pool, Some(emp), "granted", "in", 2_000).await;

    let body: Value = server
        .get("/analytics/events")
        .authorization_bearer(&token)
        .await
        .json();
    let ts: Vec<i64> = body
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["timestamp_ms"].as_i64().unwrap())
        .collect();
    assert_eq!(ts, vec![3_000, 2_000, 1_000]);
}

#[tokio::test]
async fn events_filter_by_employee_id() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let a = common::insert_employee_with_shift(&pool, "Filter-A", None).await;
    let b = common::insert_employee_with_shift(&pool, "Filter-B", None).await;
    common::insert_event(&pool, Some(a), "granted", "in", 1_000).await;
    common::insert_event(&pool, Some(b), "granted", "in", 2_000).await;
    common::insert_event(&pool, Some(a), "granted", "in", 3_000).await;

    let body: Value = server
        .get(&format!("/analytics/events?employee_id={}", a))
        .authorization_bearer(&token)
        .await
        .json();
    let rows = body.as_array().unwrap();
    assert_eq!(rows.len(), 2);
    for r in rows {
        assert_eq!(r["employee_name"], "Filter-A");
    }
}

#[tokio::test]
async fn events_filter_by_status() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Status-Filter", None).await;
    common::insert_event(&pool, Some(emp), "granted", "in", 1_000).await;
    common::insert_event(&pool, None, "unknown", "in", 2_000).await;
    common::insert_event(&pool, Some(emp), "granted", "in", 3_000).await;

    let body: Value = server
        .get("/analytics/events?status=unknown")
        .authorization_bearer(&token)
        .await
        .json();
    let rows = body.as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["status"], "unknown");
}

#[tokio::test]
async fn events_filter_by_time_range() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Time-Filter", None).await;
    for ts in [1_000_i64, 2_000, 3_000, 4_000, 5_000] {
        common::insert_event(&pool, Some(emp), "granted", "in", ts).await;
    }

    let body: Value = server
        .get("/analytics/events?from=2000&to=4000")
        .authorization_bearer(&token)
        .await
        .json();
    let ts: Vec<i64> = body
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["timestamp_ms"].as_i64().unwrap())
        .collect();
    // Inclusive on both ends per the SQL (>= and <=).
    assert_eq!(ts, vec![4_000, 3_000, 2_000]);
}

#[tokio::test]
async fn events_limit_is_clamped_to_200() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Limit", None).await;
    // 250 rows so we can prove the cap kicks in.
    for i in 0..250_i64 {
        common::insert_event(&pool, Some(emp), "granted", "in", 1000 + i).await;
    }

    let body: Value = server
        .get("/analytics/events?limit=500")
        .authorization_bearer(&token)
        .await
        .json();
    assert_eq!(body.as_array().unwrap().len(), 200);
}

#[tokio::test]
async fn events_offset_skips_rows() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    let emp = common::insert_employee_with_shift(&pool, "Offset", None).await;
    for ts in [1_000_i64, 2_000, 3_000] {
        common::insert_event(&pool, Some(emp), "granted", "in", ts).await;
    }

    // Newest first: [3000, 2000, 1000]. With offset=1, limit=1 -> [2000].
    let body: Value = server
        .get("/analytics/events?limit=1&offset=1")
        .authorization_bearer(&token)
        .await
        .json();
    let rows = body.as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["timestamp_ms"].as_i64().unwrap(), 2_000);
}

#[tokio::test]
async fn events_employee_name_is_null_for_unknown_faces() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool.clone()).await;
    let token = common::login_admin(&server).await;

    common::insert_event(&pool, None, "unknown", "in", 1_000).await;

    let body: Value = server
        .get("/analytics/events")
        .authorization_bearer(&token)
        .await
        .json();
    let rows = body.as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert!(rows[0]["employee_name"].is_null());
}

// ============================================================
// Auth gating on analytics routes
// ============================================================

#[tokio::test]
async fn analytics_endpoints_require_auth() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    for path in [
        "/analytics/access-by-hour",
        "/analytics/events",
        "/analytics/avg-delay",
        "/analytics/presence-heatmap",
        "/analytics/summary-today",
        "/analytics/present-today",
    ] {
        server.get(path).await.assert_status_unauthorized();
    }
}
