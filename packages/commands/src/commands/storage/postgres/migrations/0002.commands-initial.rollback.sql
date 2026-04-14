-- Rollback: recreate legacy table and move data back.
-- Note: this rollback is best-effort; some data (group_id, executed_at,
-- completed_at) will be lost.

CREATE TABLE IF NOT EXISTS ts_device_commands (
    id              SERIAL          PRIMARY KEY,
    device_id       TEXT            NOT NULL,
    attribute       TEXT            NOT NULL,
    user_id         TEXT            NOT NULL,
    value           TEXT            NOT NULL,
    data_type       data_type       NOT NULL,
    status          command_status  NOT NULL,
    timestamp       TIMESTAMPTZ     NOT NULL,
    status_details  TEXT
);

INSERT INTO ts_device_commands (id, device_id, attribute, user_id, value, data_type,
                                 status, timestamp, status_details)
SELECT id, device_id, attribute, user_id, value, data_type,
       status, created_at, status_details
FROM commands
ON CONFLICT DO NOTHING;

ALTER TABLE ts_data_points DROP CONSTRAINT IF EXISTS ts_data_points_command_id_fkey;
ALTER TABLE ts_data_points
    ADD CONSTRAINT ts_data_points_command_id_fkey
    FOREIGN KEY (command_id) REFERENCES ts_device_commands (id);

DROP TABLE IF EXISTS commands;
