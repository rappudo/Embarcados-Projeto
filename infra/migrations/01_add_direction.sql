-- ============================================================
--  FaceGateway — add `direction` column to access_events
--
--  Motivation: the dashboard's "Pessoas presentes hoje" card
--  needs to distinguish entry vs. exit events. The edge isn't
--  yet emitting a direction field, so existing/new rows from
--  the Pi default to 'in'. The MQTT subscriber accepts the
--  field optionally; once the edge starts publishing it, the
--  value flows through with no further migration.
--
--  Safety: this file is loaded by /docker-entrypoint-initdb.d
--  only on FIRST boot of an empty data volume. For an existing
--  cluster, apply it manually:
--      psql -U facegate -d facegate -f 01_add_direction.sql
--  (the IF NOT EXISTS guard makes it re-runnable).
-- ============================================================

ALTER TABLE access_events
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'in'
        CHECK (direction IN ('in', 'out'));

CREATE INDEX IF NOT EXISTS idx_access_events_direction
    ON access_events (direction);
