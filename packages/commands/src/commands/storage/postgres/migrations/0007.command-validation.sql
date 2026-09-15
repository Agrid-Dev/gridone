-- depends: 0006.reset-command-templates
ALTER TABLE unit_commands ADD COLUMN validation JSONB, ADD COLUMN requested_value JSONB;
