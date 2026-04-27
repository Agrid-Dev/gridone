-- depends:

CREATE TABLE IF NOT EXISTS notifications (
    id             TEXT PRIMARY KEY,
    title          TEXT NOT NULL,
    body           TEXT NOT NULL,
    severity       TEXT NOT NULL,
    correlation_id TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_recipients (
    notification_id TEXT    NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id         TEXT    NOT NULL,
    dismissed       BOOLEAN NOT NULL DEFAULT FALSE,
    dismissed_at    TIMESTAMPTZ,
    PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_id
    ON notification_recipients(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_correlation_id
    ON notifications(correlation_id)
    WHERE correlation_id IS NOT NULL;
