-- depends: 0003.automations-action

ALTER TABLE automations
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN created_by TEXT NOT NULL DEFAULT '';
