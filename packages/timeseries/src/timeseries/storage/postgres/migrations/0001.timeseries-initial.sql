-- depends:

DO $$ BEGIN
    CREATE TYPE data_type AS ENUM ('int', 'float', 'str', 'bool');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE command_status AS ENUM ('success', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ts_series (
    id          TEXT        NOT NULL,
    data_type   data_type   NOT NULL,
    owner_id    TEXT        NOT NULL,
    metric      TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ts_series_pkey PRIMARY KEY (id),
    CONSTRAINT ts_series_owner_metric_uq UNIQUE (owner_id, metric)
);

CREATE INDEX IF NOT EXISTS idx_ts_series_owner_id ON ts_series (owner_id);
CREATE INDEX IF NOT EXISTS idx_ts_series_metric   ON ts_series (metric);

CREATE TABLE IF NOT EXISTS ts_device_commands (
    id              SERIAL          PRIMARY KEY,
    device_id       TEXT            NOT NULL,
    attribute       TEXT            NOT NULL,
    user_id         TEXT            NOT NULL,
    value           TEXT            NOT NULL,
    data_type       data_type       NOT NULL,
    status          command_status  NOT NULL,
    timestamp       TIMESTAMPTZ     NOT NULL,
    status_details  TEXT
);

CREATE TABLE IF NOT EXISTS ts_data_points (
    series_id     TEXT            NOT NULL REFERENCES ts_series (id) ON DELETE CASCADE,
    timestamp     TIMESTAMPTZ     NOT NULL,
    value_integer BIGINT,
    value_float   DOUBLE PRECISION,
    value_boolean BOOLEAN,
    value_string  TEXT,
    command_id    INTEGER         REFERENCES ts_device_commands (id),
    PRIMARY KEY (series_id, timestamp)
);

-- For existing databases where ts_data_points was created without command_id.
ALTER TABLE ts_data_points
    ADD COLUMN IF NOT EXISTS command_id INTEGER REFERENCES ts_device_commands (id);
