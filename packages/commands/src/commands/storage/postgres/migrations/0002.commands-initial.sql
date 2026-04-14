-- depends: 0001.commands-enum-setup

CREATE TABLE IF NOT EXISTS commands (
    id              SERIAL          PRIMARY KEY,
    group_id        TEXT,
    device_id       TEXT            NOT NULL,
    attribute       TEXT            NOT NULL,
    value           TEXT            NOT NULL,
    data_type       data_type       NOT NULL,
    status          command_status  NOT NULL DEFAULT 'pending',
    status_details  TEXT,
    user_id         TEXT            NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL,
    executed_at     TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commands_device_id ON commands (device_id);
CREATE INDEX IF NOT EXISTS idx_commands_group_id ON commands (group_id);
CREATE INDEX IF NOT EXISTS idx_commands_user_id ON commands (user_id);
CREATE INDEX IF NOT EXISTS idx_commands_created_at ON commands (created_at);

-- Migrate data from legacy ts_device_commands table if it exists.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'ts_device_commands'
    ) THEN
        INSERT INTO commands (id, group_id, device_id, attribute, value, data_type,
                              status, status_details, user_id, created_at,
                              executed_at, completed_at)
        SELECT id, NULL, device_id, attribute, value, data_type,
               status, status_details, user_id, timestamp,
               NULL, NULL
        FROM ts_device_commands
        ON CONFLICT DO NOTHING;

        -- Sync the serial sequence to avoid ID conflicts.
        PERFORM setval('commands_id_seq',
            (SELECT COALESCE(MAX(id), 1) FROM commands),
            (SELECT MAX(id) IS NOT NULL FROM commands)
        );

        -- Update ts_data_points FK to reference the new commands table.
        ALTER TABLE ts_data_points DROP CONSTRAINT IF EXISTS ts_data_points_command_id_fkey;
        ALTER TABLE ts_data_points
            ADD CONSTRAINT ts_data_points_command_id_fkey
            FOREIGN KEY (command_id) REFERENCES commands (id);

        DROP TABLE ts_device_commands;
    END IF;
END $$;
