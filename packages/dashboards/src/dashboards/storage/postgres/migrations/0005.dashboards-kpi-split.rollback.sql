-- Back to the single ``kpi`` type with its ``temporal`` selector:
--   kpi_live    -> {"type": "kpi", "temporal": "live"}
--   kpi_history -> {"type": "kpi", "temporal": {"operator": <agg>}}
UPDATE dashboards d
SET widgets = (
    SELECT jsonb_agg(
        CASE
            WHEN w -> 'config' ->> 'type' = 'kpi_history'
            THEN jsonb_set(
                w,
                '{config}',
                ((w -> 'config') - 'agg')
                || jsonb_build_object(
                    'type', 'kpi',
                    'temporal', jsonb_build_object('operator', w -> 'config' -> 'agg')
                )
            )
            WHEN w -> 'config' ->> 'type' = 'kpi_live'
            THEN jsonb_set(
                w,
                '{config}',
                (w -> 'config')
                || jsonb_build_object('type', 'kpi', 'temporal', 'live')
            )
            ELSE w
        END
        ORDER BY position
    )
    FROM jsonb_array_elements(d.widgets) WITH ORDINALITY AS e (w, position)
)
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(d.widgets) AS w
    WHERE w -> 'config' ->> 'type' IN ('kpi_live', 'kpi_history')
);
