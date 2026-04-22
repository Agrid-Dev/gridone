-- depends: 0004.add-command-templates

-- Repoint ``ts_data_points.command_id`` at ``unit_commands``.
--
-- The ``DO`` block in 0002 only swapped the FK when ``ts_device_commands``
-- already existed at migration time (i.e. the timeseries package had run
-- its own 0001 first). When commands migrations run on a fresh DB before
-- the timeseries package, the conditional is skipped — and by the time
-- timeseries later creates ``ts_device_commands`` + ``ts_data_points``,
-- yoyo has already marked our 0002 as applied, so the FK ends up pinned
-- to the legacy table and never reaches ``unit_commands``.
--
-- This migration is idempotent and order-independent: drop any existing
-- FK on ``ts_data_points.command_id`` and recreate it against
-- ``unit_commands``. Also drops the long-deprecated ``ts_device_commands``
-- table if it's still around.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'ts_data_points'
    ) THEN
        ALTER TABLE ts_data_points
            DROP CONSTRAINT IF EXISTS ts_data_points_command_id_fkey;
        ALTER TABLE ts_data_points
            ADD CONSTRAINT ts_data_points_command_id_fkey
            FOREIGN KEY (command_id) REFERENCES unit_commands (id);
    END IF;

    DROP TABLE IF EXISTS ts_device_commands;
END $$;
