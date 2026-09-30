-- depends: 0004.app-config

ALTER TABLE apps
    ADD COLUMN status_message TEXT;
