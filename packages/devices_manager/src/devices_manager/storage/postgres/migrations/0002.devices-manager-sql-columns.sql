-- depends: 0001.devices-manager-initial

-- =============================================================================
-- dm_transports: extract top-level columns, config stays JSONB
-- =============================================================================

ALTER TABLE dm_transports
    ADD COLUMN name TEXT NOT NULL DEFAULT '',
    ADD COLUMN protocol TEXT NOT NULL DEFAULT '',
    ADD COLUMN config JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN connection_state JSONB NOT NULL DEFAULT '{}';

UPDATE dm_transports SET
    name             = COALESCE(data->>'name', ''),
    protocol         = COALESCE(data->>'protocol', ''),
    config           = COALESCE(data->'config', '{}'),
    connection_state = COALESCE(data->'connection_state', '{}');

ALTER TABLE dm_transports DROP COLUMN data;

-- =============================================================================
-- dm_drivers: vendor, model, type as columns; rest stays JSONB in data
-- =============================================================================

ALTER TABLE dm_drivers
    ADD COLUMN vendor TEXT,
    ADD COLUMN model TEXT,
    ADD COLUMN type TEXT,
    ADD COLUMN transport TEXT NOT NULL DEFAULT '';

UPDATE dm_drivers SET
    vendor    = data->>'vendor',
    model     = data->>'model',
    type      = data->>'type',
    transport = COALESCE(data->>'transport', '');

-- Rebuild data column without the extracted fields
UPDATE dm_drivers SET
    data = data - '{vendor,model,type,transport,id}'::text[];

-- =============================================================================
-- dm_devices: fully normalized with FKs
-- =============================================================================

ALTER TABLE dm_devices
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'physical',
    ADD COLUMN name TEXT NOT NULL DEFAULT '',
    ADD COLUMN type TEXT,
    ADD COLUMN config JSONB,
    ADD COLUMN driver_id TEXT REFERENCES dm_drivers(id),
    ADD COLUMN transport_id TEXT REFERENCES dm_transports(id);

UPDATE dm_devices SET
    kind         = COALESCE(data->>'kind', 'physical'),
    name         = COALESCE(data->>'name', ''),
    type         = data->>'type',
    config       = data->'config',
    driver_id    = data->>'driver_id',
    transport_id = data->>'transport_id';

ALTER TABLE dm_devices DROP COLUMN data;

-- =============================================================================
-- dm_device_attributes: new table (prepares for step 2)
-- =============================================================================

CREATE TABLE dm_device_attributes (
    device_id       TEXT NOT NULL REFERENCES dm_devices(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    data_type       TEXT NOT NULL,
    read_write_modes JSONB NOT NULL DEFAULT '[]',
    current_value   JSONB,
    last_updated    TIMESTAMPTZ,
    last_changed    TIMESTAMPTZ,
    PRIMARY KEY (device_id, name)
);
