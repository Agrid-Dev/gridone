DO $$ BEGIN RAISE NOTICE 'Rollback: deleting non-command_template automations (data loss expected)'; END $$;
DELETE FROM automations WHERE action->>'provider_id' <> 'command_template';
ALTER TABLE automations ADD COLUMN action_template_id TEXT;
UPDATE automations SET action_template_id = action->'params'->>'template_id';
ALTER TABLE automations ALTER COLUMN action_template_id SET NOT NULL;
ALTER TABLE automations DROP COLUMN action;
