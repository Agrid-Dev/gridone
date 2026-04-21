ALTER SEQUENCE unit_commands_id_seq RENAME TO commands_id_seq;

ALTER INDEX idx_unit_commands_created_at RENAME TO idx_commands_created_at;
ALTER INDEX idx_unit_commands_user_id RENAME TO idx_commands_user_id;
ALTER INDEX idx_unit_commands_batch_id RENAME TO idx_commands_group_id;
ALTER INDEX idx_unit_commands_device_id RENAME TO idx_commands_device_id;

ALTER TABLE unit_commands RENAME COLUMN batch_id TO group_id;
ALTER TABLE unit_commands RENAME TO commands;
