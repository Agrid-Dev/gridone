-- depends: 0002.devices-manager-sql-columns

ALTER TABLE dm_devices
    ADD COLUMN tags JSONB NOT NULL DEFAULT '{}';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'device_asset_links'
    ) THEN
        UPDATE dm_devices d
        SET tags = jsonb_build_object('asset_id', jsonb_build_array(dal.asset_id))
        FROM device_asset_links dal
        WHERE dal.device_id = d.id;
    END IF;
END $$;
