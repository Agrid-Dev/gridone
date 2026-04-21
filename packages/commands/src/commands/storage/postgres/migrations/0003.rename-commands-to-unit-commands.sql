-- depends: 0002.commands-initial

-- Rename the table and the group_id column to reflect the UnitCommand /
-- BatchCommand split introduced in AGR-508. The cross-service FK from
-- ts_data_points.command_id is preserved automatically by the rename.

ALTER TABLE commands RENAME TO unit_commands;
ALTER TABLE unit_commands RENAME COLUMN group_id TO batch_id;

ALTER INDEX idx_commands_device_id RENAME TO idx_unit_commands_device_id;
ALTER INDEX idx_commands_group_id RENAME TO idx_unit_commands_batch_id;
ALTER INDEX idx_commands_user_id RENAME TO idx_unit_commands_user_id;
ALTER INDEX idx_commands_created_at RENAME TO idx_unit_commands_created_at;

ALTER SEQUENCE commands_id_seq RENAME TO unit_commands_id_seq;
