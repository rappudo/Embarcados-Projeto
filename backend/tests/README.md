# Backend integration tests

These tests exercise the real Axum router against a real Postgres instance.
They are integration tests (one `tests/*.rs` file = one binary), not unit
tests — there is essentially no logic to unit-test in the handlers; they
are thin wrappers around SQL queries.

## Prerequisites

The infra Docker stack must be running:

```bash
cd ../infra
docker compose --env-file ../.env up -d
```

This brings up Postgres (`facegate-db`) and Mosquitto (`facegate-broker`).
The tests use Postgres directly; the MQTT client is built but its event
loop is never polled, so the broker doesn't need to be reachable for the
HTTP-side assertions to pass.

## Running

The tests need `DATABASE_URL` to point at the running Postgres. The
helper creates a separate `facegate_test` database and applies the
`infra/migrations/*.sql` files to it, so your dev `facegate` database
is never touched.

```bash
# from backend/
DATABASE_URL=postgresql://facegate:bogosbinted@localhost:5432/facegate \
  cargo test -- --test-threads=1
```

`--test-threads=1` is required because tests share the `facegate_test`
DB. Each test calls `reset_db()` to truncate app tables; without serial
execution they'd race.

Run a single suite:

```bash
DATABASE_URL=... cargo test --test auth -- --test-threads=1
DATABASE_URL=... cargo test --test employees -- --test-threads=1
DATABASE_URL=... cargo test --test users -- --test-threads=1
DATABASE_URL=... cargo test --test embeddings -- --test-threads=1
DATABASE_URL=... cargo test --test mqtt_handler -- --test-threads=1
DATABASE_URL=... cargo test --test analytics -- --test-threads=1
```

Run a single test by name:

```bash
DATABASE_URL=... cargo test --test employees update_employee_partial -- --test-threads=1
```

## What's covered

| File                | Tests | Coverage                                                                                                  |
| ------------------- | -----:| --------------------------------------------------------------------------------------------------------- |
| `auth.rs`           | 9     | `/health`, `/auth/login` (success, wrong pw, unknown email), 401s, expired tokens, wrong-secret tokens    |
| `employees.rs`      | 13    | full CRUD + validation, ordering, partial PATCH, null shift clear                                         |
| `users.rs`          | 6     | list, create, duplicate email (409), short password, empty email                                          |
| `embeddings.rs`     | 9     | 512-d enforcement, FK 404, cascade on employee delete, list semantics, lossless f32 round-trip            |
| `mqtt_handler.rs`   | 9     | `handle_publish` direct: granted/unknown insert, status/direction validation, default direction, FK error |
| `analytics.rs`      | 17    | all 6 analytics endpoints: access-by-hour, summary-today, present-today, avg-delay (incl. noite post-midnight normalization), heatmap, events filters + pagination |
| `openapi.rs`        | 3     | `/api-docs/openapi.json` shape, every handler is in the spec, `/swagger-ui/` HTML serves                  |

**Total: 66 tests across 7 files. ~7s wall-clock.**

## Continuous integration

The `backend` job in `.github/workflows/ci.yml` runs the full suite on
every push and pull request, against a `pgvector/pgvector:pg16` service
container. The Mosquitto broker is intentionally NOT provided to CI —
verified that the test helper builds a rumqttc `AsyncClient` whose event
loop is never polled, so no broker connection is attempted.

### Coverage

CI runs `cargo llvm-cov` (LLVM source-based instrumentation, installed
via the `taiki-e/install-action@cargo-llvm-cov` prebuilt action) and:

- Prints a per-file + total summary to the run log
- Uploads `coverage.lcov` as a workflow artifact (`backend-coverage`)

To reproduce locally:

```bash
# one-time: cargo install cargo-llvm-cov
cd backend
DATABASE_URL=... cargo llvm-cov --lcov --output-path coverage.lcov -- --test-threads=1
cargo llvm-cov report --summary-only
```

## Not yet covered

- `/system/mqtt-status` — needs the MQTT eventloop driver to flip the
  `connected` flag. Easier to mock by writing to the `MqttStateHandle`
  before building the router; deferred because the route is a trivial passthrough.
- End-to-end MQTT (broker → subscriber → DB) — `handle_publish` is
  tested directly, so only the `EventLoop` → `handle_publish` glue is
  uncovered. Low value relative to the cost of bringing up an in-process broker.
- `/models/*` static file serving — pure `tower-http::ServeDir`.
