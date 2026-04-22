DROP INDEX IF EXISTS idx_unit_commands_template_id;
ALTER TABLE unit_commands DROP COLUMN IF EXISTS template_id;
DROP INDEX IF EXISTS idx_command_templates_name;
DROP TABLE IF EXISTS command_templates;
