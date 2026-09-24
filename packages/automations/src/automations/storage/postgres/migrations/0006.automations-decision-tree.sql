-- depends: 0005.automations-action-failure

ALTER TABLE automations ADD COLUMN branches JSONB;
UPDATE automations SET branches = jsonb_build_array(jsonb_build_object(
    'id', substr(md5(id || ':branch'), 1, 16),
    'name', '', 'condition', NULL, 'action', action
));
ALTER TABLE automations ALTER COLUMN branches SET NOT NULL;
ALTER TABLE automations DROP COLUMN action;
ALTER TABLE automations ADD COLUMN deactivation JSONB;
ALTER TABLE automations ADD COLUMN guardrails JSONB NOT NULL DEFAULT '{}';
ALTER TABLE automations ADD COLUMN max_age_seconds DOUBLE PRECISION;
ALTER TABLE automation_executions ADD COLUMN context JSONB;
ALTER TABLE automation_executions ADD COLUMN branch_id TEXT;
ALTER TABLE automation_executions ADD COLUMN branches JSONB NOT NULL DEFAULT '[]';
ALTER TABLE automation_executions ADD COLUMN reason TEXT;
