-- depends: 0007.assets-building-models

-- Version of the converter that produced the stored scene. NULL marks a scene
-- built before versioning (treated as stale and rebuilt in the background).
ALTER TABLE building_models
    ADD COLUMN converter_version INTEGER;
