-- depends: 0007.assets-building-models

-- Version of the converter that produced the stored scene. NULL marks a scene
-- built before versioning (treated as stale and rebuilt in the background).
--
-- Guarded for the same reason as 0006: this shipped as
-- 0007.assets-model-converter-version on the earlier branch, and yoyo replays
-- a renumbered migration because its ledger is keyed on the id alone.
ALTER TABLE building_models
    ADD COLUMN IF NOT EXISTS converter_version INTEGER;
