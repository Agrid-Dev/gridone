-- Multi-branch rules cannot be represented by the previous schema. Refuse a
-- lossy rollback; operators must explicitly reduce them to one branch first.
-- A deactivation trace has no previous representation: the disabled state is
-- kept, the reason is dropped.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM automations WHERE jsonb_array_length(branches) <> 1
        OR branches->0->'condition' <> 'null'::jsonb
        OR jsonb_array_length(COALESCE(branches->0->'branches', '[]'::jsonb)) > 0) THEN
        RAISE EXCEPTION 'Cannot roll back conditional automations';
    END IF;
END $$;
ALTER TABLE automations ADD COLUMN action JSONB;
UPDATE automations SET action = branches->0->'action';
ALTER TABLE automations ALTER COLUMN action SET NOT NULL;
ALTER TABLE automation_executions DROP COLUMN reason;
ALTER TABLE automation_executions DROP COLUMN branches;
ALTER TABLE automation_executions DROP COLUMN branch_id;
ALTER TABLE automation_executions DROP COLUMN context;
ALTER TABLE automations DROP COLUMN max_age_seconds;
ALTER TABLE automations DROP COLUMN guardrails;
ALTER TABLE automations DROP COLUMN deactivation;
ALTER TABLE automations DROP COLUMN branches;
