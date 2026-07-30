-- depends: 0004.app-config

ALTER TABLE apps
    DROP COLUMN config,
    DROP COLUMN push_status;
