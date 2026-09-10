-- depends: 0007.devices-manager-drop-device-type

CREATE TABLE dm_presentation_resources (
    driver_id text NOT NULL,
    revision text NOT NULL,
    asset_id text NOT NULL,
    media_type text NOT NULL,
    sha256 text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    data bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (driver_id, revision, asset_id)
);
