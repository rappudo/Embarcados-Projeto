-- ============================================================
--  FaceGateway — initial database schema
--  Target: PostgreSQL 16 with the pgvector extension
--  This file is auto-loaded by the postgres container on first
--  boot via /docker-entrypoint-initdb.d.
-- ============================================================

-- pgvector — required for the embeddings(vector(128)) column.
CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------------------
--  employees
--  Anchor table. Every access event and embedding FKs into it.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
    id          SERIAL       PRIMARY KEY,
    name        TEXT         NOT NULL,
    shift       TEXT,                    -- 'manhã' | 'tarde' | 'noite' (nullable until set)
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_name ON employees (name);

-- ------------------------------------------------------------
--  access_events
--  One row per face-detection result published by the edge.
--  employee_id is NULL when status = 'unknown'.
--  ON DELETE SET NULL preserves access history if an employee
--  is later removed (history must remain auditable).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_events (
    id            SERIAL            PRIMARY KEY,
    employee_id   INTEGER           REFERENCES employees(id) ON DELETE SET NULL,
    status        TEXT              NOT NULL CHECK (status IN ('granted', 'unknown')),
    distance      DOUBLE PRECISION,
    timestamp_ms  BIGINT            NOT NULL,
    device_id     TEXT,
    created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- timestamp_ms DESC supports the "latest 20 events" listing in 5.3.
CREATE INDEX IF NOT EXISTS idx_access_events_timestamp_ms ON access_events (timestamp_ms DESC);
-- employee_id supports the JOIN in /analytics/events and the per-employee delay query in 4.6.
CREATE INDEX IF NOT EXISTS idx_access_events_employee_id  ON access_events (employee_id);
-- status supports the granted-only filter in /analytics/presence-heatmap.
CREATE INDEX IF NOT EXISTS idx_access_events_status       ON access_events (status);

-- ------------------------------------------------------------
--  users
--  Backend operators (the panel logs in with these).
--  password_hash is SHA-256 hex for the demo — no bcrypt yet.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id             SERIAL       PRIMARY KEY,
    email          TEXT         NOT NULL UNIQUE,
    password_hash  TEXT         NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed the default admin so the panel works on first boot.
--   email:    admin@facegate.local
--   password: admin123
--   hash:     SHA-256("admin123") = 240be518...c720a9
INSERT INTO users (email, password_hash)
VALUES (
    'admin@facegate.local',
    '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
)
ON CONFLICT (email) DO NOTHING;

-- ------------------------------------------------------------
--  embeddings
--  128-dim MobileFaceNet vectors.
--  ON DELETE CASCADE: removing an employee removes their face
--  data. (Different policy than access_events on purpose:
--  embeddings are personal data, events are audit log.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS embeddings (
    id           SERIAL        PRIMARY KEY,
    employee_id  INTEGER       NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    vector       vector(128)   NOT NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_employee_id ON embeddings (employee_id);

-- Optional ANN index for cosine distance. Skip for now — sequential
-- scan is fine under a few thousand rows, and ivfflat needs the
-- table to be populated before CREATE INDEX is called for the
-- `lists` parameter to be tuned correctly. Uncomment once you have
-- real data.
--
-- CREATE INDEX IF NOT EXISTS idx_embeddings_vector_cosine
--     ON embeddings USING ivfflat (vector vector_cosine_ops)
--     WITH (lists = 100);
