-- depends: 0004.dashboards-chart-targets

-- The ``kpi`` widget type splits by when it reads: ``kpi_live`` shows the
-- present, ``kpi_history`` reduces the dashboard period with ``agg``. The
-- old single type chose between the two with ``temporal``:
--   {"type": "kpi", "temporal": "live", ...}         -> {"type": "kpi_live", ...}
--   {"type": "kpi", "temporal": {"operator": "avg"}} -> {"type": "kpi_history", "agg": "avg", ...}
-- ``temporal`` defaulted to "live" when absent.
UPDATE dashboards d
SET widgets = (
    SELECT jsonb_agg(
        CASE
            WHEN w -> 'config' ->> 'type' = 'kpi'
                AND jsonb_typeof(w -> 'config' -> 'temporal') = 'object'
            THEN jsonb_set(
                w,
                '{config}',
                ((w -> 'config') - 'temporal')
                || jsonb_build_object(
                    'type', 'kpi_history',
                    'agg', w -> 'config' -> 'temporal' -> 'operator'
                )
            )
            WHEN w -> 'config' ->> 'type' = 'kpi'
            THEN jsonb_set(
                w,
                '{config}',
                ((w -> 'config') - 'temporal')
                || jsonb_build_object('type', 'kpi_live')
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
    WHERE w -> 'config' ->> 'type' = 'kpi'
);
