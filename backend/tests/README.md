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
```

Run a single test by name:

```bash
DATABASE_URL=... cargo test --test employees update_employee_partial -- --test-threads=1
```

## What's covered

| File                | Coverage                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `auth.rs`           | `/health`, `/auth/login` (success, wrong pw, unknown email), 401s, expired tokens, wrong-secret tokens    |
| `employees.rs`      | full CRUD + validation, ordering, partial PATCH, null shift clear                                         |
| `users.rs`          | list, create, duplicate email (409), short password, empty email                                          |
| `embeddings.rs`     | 512-d enforcement, FK 404, cascade on employee delete, list semantics, lossless f32 round-trip            |
| `mqtt_handler.rs`   | `handle_publish` direct: granted/unknown insert, status/direction validation, default direction, FK error |
| `analytics.rs`      | all 6 analytics endpoints: access-by-hour, summary-today, present-today, avg-delay (incl. noite post-midnight normalization), heatmap, events filters + pagination |

Total: 63 tests across 6 files.

## Not yet covered

- `/system/mqtt-status` — needs the MQTT eventloop driver to flip the
  `connected` flag. Easier to mock by writing to the `MqttStateHandle`
  before building the router; deferred because the route is a trivial passthrough.
- End-to-end MQTT (broker → subscriber → DB) — `handle_publish` is
  tested directly, so only the `EventLoop` → `handle_publish` glue is
  uncovered. Low value relative to the cost of bringing up an in-process broker.
- `/models/*` static file serving — pure `tower-http::ServeDir`.
