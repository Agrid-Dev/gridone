-- rollback: 0002.devices-manager-sql-columns

DROP TABLE IF EXISTS dm_device_attributes;

-- Restore dm_devices data column from columns
ALTER TABLE dm_devices ADD COLUMN data JSONB NOT NULL DEFAULT '{}';
UPDATE dm_devices SET data = jsonb_build_object(
    'id', id,
    'kind', kind,
    'name', name,
    'type', type,
    'config', config,
    'driver_id', driver_id,
    'transport_id', transport_id
);
ALTER TABLE dm_devices
    DROP COLUMN kind,
    DROP COLUMN name,
    DROP COLUMN type,
    DROP COLUMN config,
    DROP COLUMN driver_id,
    DROP COLUMN transport_id;

-- Restore dm_drivers: merge columns back into data
UPDATE dm_drivers SET data = data || jsonb_build_object(
    'id', id,
    'vendor', vendor,
    'model', model,
    'type', type,
    'transport', transport
);
ALTER TABLE dm_drivers
    DROP COLUMN vendor,
    DROP COLUMN model,
    DROP COLUMN type,
    DROP COLUMN transport;

-- Restore dm_transports data column from columns
ALTER TABLE dm_transports ADD COLUMN data JSONB NOT NULL DEFAULT '{}';
UPDATE dm_transports SET data = jsonb_build_object(
    'id', id,
    'name', name,
    'protocol', protocol,
    'config', config,
    'connection_state', connection_state
);
ALTER TABLE dm_transports
    DROP COLUMN name,
    DROP COLUMN protocol,
    DROP COLUMN config,
    DROP COLUMN connection_state;
