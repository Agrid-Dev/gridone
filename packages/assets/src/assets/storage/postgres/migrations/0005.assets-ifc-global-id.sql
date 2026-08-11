-- depends: 0004.assets-created-updated-at

ALTER TABLE assets
    ADD COLUMN ifc_global_id TEXT;
