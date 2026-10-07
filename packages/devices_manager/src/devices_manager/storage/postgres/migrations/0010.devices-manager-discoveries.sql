-- depends: 0009.devices-manager-multivalued-tags

CREATE TABLE dm_discoveries (
    driver_id TEXT NOT NULL REFERENCES dm_drivers(id),
    transport_id TEXT NOT NULL REFERENCES dm_transports(id),
    PRIMARY KEY (driver_id, transport_id)
);
