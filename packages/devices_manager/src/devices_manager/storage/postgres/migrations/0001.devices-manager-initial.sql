-- depends:

CREATE TABLE IF NOT EXISTS dm_devices (
    id   TEXT PRIMARY KEY,
    data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_drivers (
    id   TEXT PRIMARY KEY,
    data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_transports (
    id   TEXT PRIMARY KEY,
    data JSONB NOT NULL
);
