-- depends: 0007.command-validation
ALTER TABLE unit_commands ADD COLUMN ui_confirmation JSONB,
    ADD COLUMN value_redacted BOOLEAN NOT NULL DEFAULT FALSE;
