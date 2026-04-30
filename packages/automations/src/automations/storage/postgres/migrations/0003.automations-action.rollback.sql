ALTER TABLE automations ADD COLUMN action_template_id TEXT;
UPDATE automations SET action_template_id = action->>'template_id';
ALTER TABLE automations ALTER COLUMN action_template_id SET NOT NULL;
ALTER TABLE automations DROP COLUMN action;
