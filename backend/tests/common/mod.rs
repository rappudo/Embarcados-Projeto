// Each integration-test file compiles `common/mod.rs` into its own crate,
// so any helper not used by *that specific* test file shows up as dead
// code. Silencing here rather than per-item.
#![allow(dead_code)]

//! Shared test harness for integration tests.
//!
//! Each integration test file (`tests/foo.rs`) is compiled into its own
//! binary by Cargo, so anything in `tests/common/mod.rs` is `mod`-ed in
//! per file. We keep this module compact and idempotent.
//!
//! Strategy:
//!   * One **test database** (separate from the dev DB), created on first
//!     use and migrated. The DB is shared across tests because creating
//!     it per-test is too slow; isolation comes from `reset_db()` which
//!     each test calls in setup to TRUNCATE app tables.
//!   * MQTT: we build a real `AsyncClient` but **never poll its
//!     eventloop**. The library's `publish_*` calls are best-effort
//!     fire-and-forget — they enqueue into the client's channel and
//!     return immediately, which is exactly what we want in tests.
//!   * Tests run on a single tokio runtime per `#[tokio::test]` and are
//!     forced to execute serially (see `tests/.cargo/config`-equivalent
//!     in `Cargo.toml` is not needed — instead, `cargo test -- --test-threads=1`
//!     is the supported way; see README in this directory).

use std::sync::{Arc, Mutex as StdMutex, OnceLock};

use axum::Router;
use axum_test::TestServer;
use backend::routes;
use chrono::{FixedOffset, NaiveDate, TimeZone, Utc};
use rumqttc::{AsyncClient, MqttOptions};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::sync::RwLock;

const TEST_DB_NAME: &str = "facegate_test";
pub const TEST_JWT_SECRET: &str = "test-jwt-secret-do-not-use-in-prod";

/// One-time-per-process guard for "create test DB + run migrations".
/// We do NOT cache a `PgPool` across tests because each `#[tokio::test]`
/// runs on its own runtime; a pool created on runtime A becomes useless
/// on runtime B (background tasks are tied to A's reactor and timeouts
/// fire when B tries to acquire a connection). Each test gets its own
/// fresh pool; only the schema setup is amortized via this flag.
static SETUP_DONE: OnceLock<StdMutex<bool>> = OnceLock::new();

/// Build the admin database URL by stripping the database name off the
/// `DATABASE_URL` env var. We connect to the default `postgres` database
/// to issue `CREATE DATABASE facegate_test` because you can't create a
/// DB while connected to it.
fn admin_url() -> String {
    let raw = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://facegate:bogosbinted@localhost:5432/facegate".to_string());
    // Replace whatever's after the last '/' with the admin DB. The URL
    // shape is postgresql://user:pass@host:port/dbname — split on the
    // last '/' and append `postgres`.
    let (prefix, _) = raw.rsplit_once('/').expect("DATABASE_URL must contain a database segment");
    format!("{}/postgres", prefix)
}

fn test_db_url() -> String {
    let raw = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://facegate:bogosbinted@localhost:5432/facegate".to_string());
    let (prefix, _) = raw.rsplit_once('/').expect("DATABASE_URL must contain a database segment");
    format!("{}/{}", prefix, TEST_DB_NAME)
}

/// One-time setup per test (idempotent across the whole process):
///   * Create the test database if it doesn't exist.
///   * Apply migrations.
/// Returns a fresh pool bound to the current tokio runtime.
pub async fn pool() -> PgPool {
    // Run the heavy setup once per process. Subsequent calls skip
    // straight to "open a new pool".
    let flag = SETUP_DONE.get_or_init(|| StdMutex::new(false));
    let already_done = *flag.lock().expect("setup mutex poisoned");

    if !already_done {
        // Step 1: connect to the admin DB and create the test DB if missing.
        let admin_pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&admin_url())
            .await
            .expect("connect to admin DB (is Postgres running on the configured port?)");

        let exists: Option<(i32,)> = sqlx::query_as("SELECT 1 FROM pg_database WHERE datname = $1")
            .bind(TEST_DB_NAME)
            .fetch_optional(&admin_pool)
            .await
            .expect("check if test DB exists");
        if exists.is_none() {
            // CREATE DATABASE cannot run inside a transaction, hence raw exec.
            sqlx::query(&format!("CREATE DATABASE {}", TEST_DB_NAME))
                .execute(&admin_pool)
                .await
                .expect("create test database");
        }
        drop(admin_pool);

        // Step 2: connect to the test DB and apply migrations.
        let setup_pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&test_db_url())
            .await
            .expect("connect to test DB");
        apply_migrations(&setup_pool).await;
        setup_pool.close().await;

        *flag.lock().unwrap() = true;
    }

    // Per-test pool — bound to whichever tokio runtime this test runs on.
    PgPoolOptions::new()
        .max_connections(5)
        .connect(&test_db_url())
        .await
        .expect("connect to test DB")
}

async fn apply_migrations(pool: &PgPool) {
    // The init script lives in infra/migrations/. We load it as text and
    // execute. This is idempotent because the migration uses
    // `CREATE TABLE IF NOT EXISTS` / `ON CONFLICT DO NOTHING`.
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let migrations_dir = format!("{}/../infra/migrations", manifest_dir);

    let mut entries: Vec<_> = std::fs::read_dir(&migrations_dir)
        .unwrap_or_else(|e| panic!("read migrations dir {}: {:?}", migrations_dir, e))
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("sql"))
        .collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let sql = std::fs::read_to_string(entry.path()).expect("read migration file");
        sqlx::raw_sql(&sql)
            .execute(pool)
            .await
            .unwrap_or_else(|e| panic!("apply {}: {:?}", entry.file_name().to_string_lossy(), e));
    }
}

/// Wipe app data between tests. We keep the schema (and the seeded admin
/// user) but clear everything else. `RESTART IDENTITY` resets SERIAL
/// counters so tests don't rely on stable ids.
pub async fn reset_db(pool: &PgPool) {
    sqlx::query(
        "TRUNCATE TABLE access_events, embeddings, employees RESTART IDENTITY CASCADE",
    )
    .execute(pool)
    .await
    .expect("truncate app tables");

    // Delete all users except the seeded admin so login tests work.
    sqlx::query("DELETE FROM users WHERE email <> 'admin@facegate.local'")
        .execute(pool)
        .await
        .expect("clear non-admin users");
}

/// Build the same router the production binary uses, but with the test
/// DB pool and a non-polled MQTT client. Returns an `axum-test`
/// `TestServer` (wraps the router on a random local port).
pub async fn spawn_app(pool: PgPool) -> TestServer {
    // MQTT: client without an eventloop poller. `publish` enqueues
    // messages into a bounded channel; we never drain it. This matches
    // production's "best-effort, log-only" semantics — handlers never
    // block on the broker.
    let (mqtt_client, _eventloop) =
        AsyncClient::new(MqttOptions::new("test-client", "127.0.0.1", 1883), 32);

    // MQTT state handle — same Arc<RwLock<MqttState>> the real
    // subscriber writes to. We construct an empty one; the
    // /system/mqtt-status route reads from it.
    let mqtt_state = Arc::new(RwLock::new(backend::mqtt::MqttState::default()));

    let app: Router = routes::create_router(
        pool,
        TEST_JWT_SECRET.to_string(),
        mqtt_state,
        mqtt_client,
    );

    TestServer::new(app).expect("build TestServer")
}

/// Hash a password the way the backend does (SHA-256 hex), so tests can
/// insert users with known credentials directly via SQL.
pub fn sha256_hex(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    hex::encode(hasher.finalize())
}

/// Convenience: log in as the seeded admin and return the bearer token.
/// Saves boilerplate in every test that needs an authenticated request.
pub async fn login_admin(server: &TestServer) -> String {
    let resp = server
        .post("/auth/login")
        .json(&serde_json::json!({
            "email": "admin@facegate.local",
            "password": "admin123",
        }))
        .await;
    resp.assert_status_ok();
    resp.json::<serde_json::Value>()["token"]
        .as_str()
        .expect("token field")
        .to_string()
}

// ----------------------------------------------------------------------
// Time helpers — São Paulo (UTC-3, no DST since 2019).
//
// The analytics SQL groups by SP-local time. To write deterministic
// tests we need a way to construct unix-ms timestamps that we KNOW will
// land in a given SP hour/day-of-week. Using `chrono::FixedOffset(-3h)`
// is correct for any timestamp from 2019 onward; the Postgres timezone
// database agrees, so the two sides of the test produce the same date.
// ----------------------------------------------------------------------

pub fn sp_offset() -> FixedOffset {
    FixedOffset::west_opt(3 * 3600).expect("UTC-3 is a valid fixed offset")
}

/// Unix ms for a specific SP-local datetime.
pub fn sp_ms(date: NaiveDate, hour: u32, minute: u32) -> i64 {
    let naive = date
        .and_hms_opt(hour, minute, 0)
        .expect("valid hour/minute");
    sp_offset()
        .from_local_datetime(&naive)
        .single()
        .expect("SP has no DST gaps")
        .timestamp_millis()
}

/// Current SP-local date — matches what `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`
/// returns inside Postgres.
pub fn sp_today() -> NaiveDate {
    Utc::now().with_timezone(&sp_offset()).date_naive()
}

/// Unix ms for HH:MM on today's SP-local date.
pub fn sp_today_at(hour: u32, minute: u32) -> i64 {
    sp_ms(sp_today(), hour, minute)
}

// ----------------------------------------------------------------------
// Seed helpers
// ----------------------------------------------------------------------

/// Insert an employee with the given shift and return its id.
pub async fn insert_employee_with_shift(
    pool: &PgPool,
    name: &str,
    shift: Option<&str>,
) -> i32 {
    let row: (i32,) = sqlx::query_as(
        "INSERT INTO employees (name, shift) VALUES ($1, $2) RETURNING id",
    )
    .bind(name)
    .bind(shift)
    .fetch_one(pool)
    .await
    .expect("insert employee");
    row.0
}

/// Insert an access event row directly into the DB.
pub async fn insert_event(
    pool: &PgPool,
    employee_id: Option<i32>,
    status: &str,
    direction: &str,
    timestamp_ms: i64,
) {
    sqlx::query(
        "INSERT INTO access_events (employee_id, status, direction, timestamp_ms, distance)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(employee_id)
    .bind(status)
    .bind(direction)
    .bind(timestamp_ms)
    .bind(if status == "granted" { Some(0.3_f64) } else { None })
    .execute(pool)
    .await
    .expect("insert access_event");
}
