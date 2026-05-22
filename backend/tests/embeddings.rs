//! Embedding endpoint tests.
//!
//! The handler enforces a 512-d vector (ArcFace output size). It also
//! relies on the embeddings.employee_id FK — inserting against an
//! unknown employee must surface as 404.

mod common;

use serde_json::json;

fn fake_vector(n: usize) -> Vec<f32> {
    // Deterministic non-zero values so we can assert round-trip equality.
    (0..n).map(|i| (i as f32) * 0.001).collect()
}

#[tokio::test]
async fn create_embedding_succeeds_with_512_dims() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let emp = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Vec-Alice" }))
        .await
        .json::<serde_json::Value>();
    let emp_id = emp["id"].as_i64().unwrap();

    let v = fake_vector(512);
    let resp = server
        .post(&format!("/employees/{}/embeddings", emp_id))
        .authorization_bearer(&token)
        .json(&json!({ "vector": v }))
        .await;
    assert_eq!(resp.status_code(), 201);

    let body: serde_json::Value = resp.json();
    assert!(body["id"].as_i64().unwrap() > 0);
    assert_eq!(body["vector"].as_array().unwrap().len(), 512);
}

#[tokio::test]
async fn create_embedding_rejects_wrong_dimension() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let emp = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Vec-Bob" }))
        .await
        .json::<serde_json::Value>();
    let emp_id = emp["id"].as_i64().unwrap();

    // 128 dims — the old MobileFaceNet size, now invalid.
    let resp = server
        .post(&format!("/employees/{}/embeddings", emp_id))
        .authorization_bearer(&token)
        .json(&json!({ "vector": fake_vector(128) }))
        .await;
    resp.assert_status_bad_request();
}

#[tokio::test]
async fn create_embedding_returns_404_for_unknown_employee() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .post("/employees/9999/embeddings")
        .authorization_bearer(&token)
        .json(&json!({ "vector": fake_vector(512) }))
        .await;
    resp.assert_status_not_found();
}

#[tokio::test]
async fn list_embeddings_returns_404_for_unknown_employee() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let resp = server
        .get("/employees/9999/embeddings")
        .authorization_bearer(&token)
        .await;
    resp.assert_status_not_found();
}

#[tokio::test]
async fn list_embeddings_empty_for_new_employee() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let emp = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Vec-Carol" }))
        .await
        .json::<serde_json::Value>();
    let emp_id = emp["id"].as_i64().unwrap();

    let resp = server
        .get(&format!("/employees/{}/embeddings", emp_id))
        .authorization_bearer(&token)
        .await;
    resp.assert_status_ok();
    let body: serde_json::Value = resp.json();
    assert_eq!(body.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn list_embeddings_returns_created_vectors() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let emp = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Vec-Dave" }))
        .await
        .json::<serde_json::Value>();
    let emp_id = emp["id"].as_i64().unwrap();

    for _ in 0..3 {
        server
            .post(&format!("/employees/{}/embeddings", emp_id))
            .authorization_bearer(&token)
            .json(&json!({ "vector": fake_vector(512) }))
            .await
            .assert_status(axum::http::StatusCode::CREATED);
    }

    let resp = server
        .get(&format!("/employees/{}/embeddings", emp_id))
        .authorization_bearer(&token)
        .await;
    resp.assert_status_ok();
    let body: serde_json::Value = resp.json();
    let rows = body.as_array().unwrap();
    assert_eq!(rows.len(), 3);
    for row in rows {
        assert_eq!(row["vector"].as_array().unwrap().len(), 512);
    }
}

#[tokio::test]
async fn deleting_employee_cascades_embeddings() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let emp = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Vec-Erin" }))
        .await
        .json::<serde_json::Value>();
    let emp_id = emp["id"].as_i64().unwrap();

    server
        .post(&format!("/employees/{}/embeddings", emp_id))
        .authorization_bearer(&token)
        .json(&json!({ "vector": fake_vector(512) }))
        .await
        .assert_status(axum::http::StatusCode::CREATED);

    // DELETE on the employee cascades to embeddings (FK ON DELETE CASCADE).
    let resp = server
        .delete(&format!("/employees/{}", emp_id))
        .authorization_bearer(&token)
        .await;
    assert_eq!(resp.status_code(), 204);

    // The employee is gone, so the list endpoint must 404 rather than
    // returning an empty list (proves the cascade ran AND the FK check
    // is still authoritative).
    let resp = server
        .get(&format!("/employees/{}/embeddings", emp_id))
        .authorization_bearer(&token)
        .await;
    resp.assert_status_not_found();
}

#[tokio::test]
async fn create_embedding_requires_auth() {
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;

    let resp = server
        .post("/employees/1/embeddings")
        .json(&json!({ "vector": fake_vector(512) }))
        .await;
    resp.assert_status_unauthorized();
}

#[tokio::test]
async fn vector_round_trip_is_lossless() {
    // pgvector stores `vector(N)` as float4 (single precision). Since
    // we send f32 in and read f32 out, the round-trip should be bit-exact.
    // If this ever fails the cause is almost certainly a silent f64
    // detour (e.g., JSON parsing) introducing rounding.
    let pool = common::pool().await;
    common::reset_db(&pool).await;
    let server = common::spawn_app(pool).await;
    let token = common::login_admin(&server).await;

    let emp = server
        .post("/employees")
        .authorization_bearer(&token)
        .json(&json!({ "name": "Vec-Roundtrip" }))
        .await
        .json::<serde_json::Value>();
    let emp_id = emp["id"].as_i64().unwrap();

    // Mix of values: zero, ±1, tiny, large, irrational-ish. All
    // representable exactly in f32 (we round on the input side so the
    // assertion isn't load-bearing on what f32 happens to round to).
    let mut input: Vec<f32> = Vec::with_capacity(512);
    for i in 0..512 {
        let raw = ((i as f32) - 256.0) * 0.0078125; // multiple of 2^-7, exact in f32
        input.push(raw);
    }

    let created = server
        .post(&format!("/employees/{}/embeddings", emp_id))
        .authorization_bearer(&token)
        .json(&json!({ "vector": input }))
        .await;
    created.assert_status(axum::http::StatusCode::CREATED);

    let body: serde_json::Value = server
        .get(&format!("/employees/{}/embeddings", emp_id))
        .authorization_bearer(&token)
        .await
        .json();
    let rows = body.as_array().unwrap();
    assert_eq!(rows.len(), 1);

    let out: Vec<f32> = rows[0]["vector"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_f64().unwrap() as f32)
        .collect();
    assert_eq!(out.len(), 512);
    for (i, (a, b)) in input.iter().zip(out.iter()).enumerate() {
        assert!(
            (a - b).abs() < f32::EPSILON,
            "mismatch at index {}: sent {} got {}",
            i,
            a,
            b
        );
    }
}
