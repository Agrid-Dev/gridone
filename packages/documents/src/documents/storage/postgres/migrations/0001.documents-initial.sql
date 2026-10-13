CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size BIGINT NOT NULL CHECK (size > 0),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    asset_ids TEXT[] NOT NULL,
    device_ids TEXT[] NOT NULL,
    content BYTEA NOT NULL
);
CREATE INDEX documents_assets_idx ON documents USING GIN (asset_ids);
CREATE INDEX documents_devices_idx ON documents USING GIN (device_ids);
CREATE INDEX documents_created_idx ON documents (created_at DESC, id DESC);
