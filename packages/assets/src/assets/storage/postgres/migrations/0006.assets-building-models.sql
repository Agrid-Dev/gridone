-- depends: 0005.assets-ifc-global-id

CREATE TABLE IF NOT EXISTS building_models (
    asset_id   TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    status     TEXT NOT NULL,
    filename   TEXT NOT NULL,
    error      TEXT,
    ifc_data   BYTEA,
    glb_data   BYTEA,
    storeys    JSONB NOT NULL DEFAULT '[]'::jsonb,
    spaces     JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
