DROP TABLE IF EXISTS device_asset_links;
DROP TRIGGER IF EXISTS trg_asset_path ON assets;
DROP FUNCTION IF EXISTS update_descendant_paths;
DROP FUNCTION IF EXISTS compute_asset_path;
DROP TABLE IF EXISTS assets;
