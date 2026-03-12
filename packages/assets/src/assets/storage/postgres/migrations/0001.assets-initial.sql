-- depends:

CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE IF NOT EXISTS assets (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT REFERENCES assets(id),
    type        TEXT NOT NULL,
    name        TEXT NOT NULL,
    path        LTREE
);

CREATE INDEX IF NOT EXISTS idx_assets_path
    ON assets USING gist (path);

CREATE INDEX IF NOT EXISTS idx_assets_parent_id
    ON assets (parent_id);

CREATE OR REPLACE FUNCTION compute_asset_path()
RETURNS TRIGGER AS $$
DECLARE
    parent_path LTREE;
    sanitized_id TEXT;
BEGIN
    sanitized_id := regexp_replace(
        lower(NEW.id), '[^a-z0-9_]', '_', 'g'
    );
    IF NEW.parent_id IS NULL THEN
        NEW.path := sanitized_id::LTREE;
    ELSE
        SELECT path INTO parent_path
        FROM assets WHERE id = NEW.parent_id;
        NEW.path := parent_path || sanitized_id::LTREE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_asset_path'
    ) THEN
        CREATE TRIGGER trg_asset_path
            BEFORE INSERT OR UPDATE ON assets
            FOR EACH ROW
            EXECUTE FUNCTION compute_asset_path();
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION update_descendant_paths(moved_id TEXT)
RETURNS VOID AS $$
DECLARE
    child RECORD;
BEGIN
    FOR child IN SELECT id FROM assets WHERE parent_id = moved_id
    LOOP
        UPDATE assets SET parent_id = parent_id WHERE id = child.id;
        PERFORM update_descendant_paths(child.id);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS device_asset_links (
    device_id   TEXT NOT NULL,
    asset_id    TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    PRIMARY KEY (device_id, asset_id)
);
