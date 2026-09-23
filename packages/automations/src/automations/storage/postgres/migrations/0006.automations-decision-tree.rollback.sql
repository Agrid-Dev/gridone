-- Multi-branch rules cannot be represented by the previous schema. Refuse a
-- lossy rollback; operators must explicitly reduce them to one branch first.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM automations WHERE jsonb_array_length(branches) <> 1
        OR branches->0->'condition' <> 'null'::jsonb
        OR jsonb_array_length(COALESCE(branches->0->'branches', '[]'::jsonb)) > 0
        OR suspension IS NOT NULL) THEN
        RAISE EXCEPTION 'Cannot roll back conditional or suspended automations';
    END IF;
END $$;
ALTER TABLE automation_executions DROP COLUMN reason;
ALTER TABLE automation_executions DROP COLUMN branches;
ALTER TABLE automation_executions DROP COLUMN branch_id;
ALTER TABLE automation_executions DROP COLUMN context;
ALTER TABLE automations DROP COLUMN max_age_seconds;
ALTER TABLE automations DROP COLUMN guardrails;
ALTER TABLE automations DROP COLUMN suspension;
ALTER TABLE automations DROP COLUMN branches;
