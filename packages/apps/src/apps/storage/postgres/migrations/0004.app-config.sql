-- depends: 0003.apps-table

ALTER TABLE apps
    ADD COLUMN config JSONB,
    ADD COLUMN push_status TEXT;
