-- FaceGateway — schema do SQLite local do edge.
-- Executado no boot pelo Storage. Todas as declarações são idempotentes
-- (IF NOT EXISTS), então rodar várias vezes é seguro.

-- -----------------------------------------------------------------------------
-- Embeddings cadastrados no dispositivo.
-- Populado pelo CLI de enrollment. Carregado pelo app principal no boot.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS embeddings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    vector      BLOB    NOT NULL,
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_embeddings_employee
    ON embeddings(employee_id);

-- -----------------------------------------------------------------------------
-- Fila de mensagens MQTT pendentes de publicação.
-- Produtor: pipeline quando publish falha (rede caiu, broker fora).
-- Consumidor: drainer que tenta republicar quando a rede volta.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    topic       TEXT    NOT NULL,
    payload     TEXT    NOT NULL,
    created_at  INTEGER NOT NULL
);
