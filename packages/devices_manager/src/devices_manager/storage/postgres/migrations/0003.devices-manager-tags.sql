-- depends: 0002.devices-manager-sql-columns

ALTER TABLE dm_devices
    ADD COLUMN tags JSONB NOT NULL DEFAULT '{}';

UPDATE dm_devices d
SET tags = jsonb_build_object('asset_id', jsonb_build_array(dal.asset_id))
FROM device_asset_links dal
WHERE dal.device_id = d.id;
