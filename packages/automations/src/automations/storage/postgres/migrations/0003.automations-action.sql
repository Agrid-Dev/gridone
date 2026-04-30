-- depends: 0002.automations-add-title-description

ALTER TABLE automations ADD COLUMN action JSONB;
UPDATE automations SET action = jsonb_build_object(
    'type', 'command_template', 'template_id', action_template_id
);
ALTER TABLE automations ALTER COLUMN action SET NOT NULL;
ALTER TABLE automations DROP COLUMN action_template_id;
