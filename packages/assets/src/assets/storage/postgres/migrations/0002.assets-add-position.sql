-- depends: 0001.assets-initial

ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
