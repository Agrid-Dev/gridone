-- depends:

CREATE TABLE IF NOT EXISTS notifications (
    id             TEXT PRIMARY KEY,
    title          TEXT NOT NULL,
    body           TEXT NOT NULL,
    severity       TEXT NOT NULL,
    correlation_id TEXT UNIQUE,
    created_by     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_dispatches (
    notification_id TEXT        NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id         TEXT        NOT NULL,
    dispatched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    dismissed_at    TIMESTAMPTZ,
    PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_dispatches_user_id
    ON notification_dispatches(user_id);
