-- depends: 0003.rename-commands-to-unit-commands

-- Introduce command_templates: the reusable (target, write) description
-- that automations and the UI dispatch from. Templates with a non-null name
-- are user-saved; ephemeral templates (name IS NULL) are auto-created by
-- inline batch dispatches so the target survives for audit and
-- re-resolution. A later cleanup job will sweep old ephemerals — not in
-- this migration.

CREATE TABLE IF NOT EXISTS command_templates (
    id          TEXT          PRIMARY KEY,
    name        TEXT,
    target      JSONB         NOT NULL,
    write       JSONB         NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by  TEXT          NOT NULL
);

-- Partial index only over named templates so the list endpoint stays fast
-- even as ephemerals accumulate.
CREATE INDEX IF NOT EXISTS idx_command_templates_name
    ON command_templates (name)
    WHERE name IS NOT NULL;

ALTER TABLE unit_commands
    ADD COLUMN template_id TEXT
        REFERENCES command_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_unit_commands_template_id
    ON unit_commands (template_id);
