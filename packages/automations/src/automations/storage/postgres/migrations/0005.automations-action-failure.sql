-- depends: 0004.automations-add-metadata
ALTER TABLE automation_executions ADD COLUMN error_details JSONB;
