-- depends: 0005.dashboards-kpi-split

-- A dashboard is either ``live`` (reads the present) or ``history`` (reads
-- timeseries over a viewing period); the type decides which widgets it may
-- hold. Existing rows are classified by what they already hold: one
-- period-bound widget makes it ``history``, otherwise ``live``. A mixed
-- dashboard keeps its misfit widgets, which the service flags on read until
-- the deployment splits it by hand.
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS type TEXT;

UPDATE dashboards d
SET type = CASE
    WHEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements(d.widgets) AS w
        WHERE w -> 'config' ->> 'type' IN ('chart', 'meter_tree', 'kpi_history')
    )
    THEN 'history'
    ELSE 'live'
END
WHERE type IS NULL;

ALTER TABLE dashboards ALTER COLUMN type SET NOT NULL;
