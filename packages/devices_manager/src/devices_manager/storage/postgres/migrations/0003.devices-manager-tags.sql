-- depends: 0002.devices-manager-sql-columns

CREATE TABLE dm_device_tags (
    device_id TEXT NOT NULL REFERENCES dm_devices(id) ON DELETE CASCADE,
    key       TEXT NOT NULL,
    value     TEXT NOT NULL,
    PRIMARY KEY (device_id, key)
);

CREATE INDEX dm_device_tags_key_value ON dm_device_tags (key, value);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'device_asset_links'
    ) THEN
        INSERT INTO dm_device_tags (device_id, key, value)
        SELECT dal.device_id, 'asset_id', dal.asset_id
        FROM device_asset_links dal
        WHERE EXISTS (SELECT 1 FROM dm_devices WHERE id = dal.device_id)
        ON CONFLICT (device_id, key) DO NOTHING;
    END IF;
END $$;
