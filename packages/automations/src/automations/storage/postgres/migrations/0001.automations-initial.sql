-- depends:

CREATE TABLE IF NOT EXISTS automations (
    id                 TEXT        PRIMARY KEY,
    name               TEXT        NOT NULL,
    trigger            JSONB       NOT NULL,
    action_template_id TEXT        NOT NULL,
    enabled            BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_executions (
    id            TEXT        PRIMARY KEY,
    automation_id TEXT        NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    triggered_at  TIMESTAMPTZ NOT NULL,
    executed_at   TIMESTAMPTZ,
    status        TEXT        NOT NULL,
    error         TEXT,
    output_id     TEXT
);

CREATE INDEX IF NOT EXISTS idx_ae_automation_triggered
    ON automation_executions (automation_id, triggered_at DESC);
