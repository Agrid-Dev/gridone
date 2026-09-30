-- depends: 0001.dashboards-initial

-- Explicit display order, shared by every user. Existing rows keep their
-- creation order; new rows are appended (MAX(position) + 1) on insert.
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS position INTEGER;

UPDATE dashboards d
SET position = r.position - 1
FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS position
    FROM dashboards
) r
WHERE d.id = r.id;

ALTER TABLE dashboards ALTER COLUMN position SET NOT NULL;
