-- Best-effort rollback. We cannot meaningfully restore the legacy
-- ``ts_device_commands`` table (its schema diverged from ``unit_commands``
-- over several migrations), so we just drop the fresh constraint and
-- leave ``ts_data_points.command_id`` unconstrained.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'ts_data_points'
    ) THEN
        ALTER TABLE ts_data_points
            DROP CONSTRAINT IF EXISTS ts_data_points_command_id_fkey;
    END IF;
END $$;
