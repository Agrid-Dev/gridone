-- Back to one ``config.target`` per chart. Lossy for a chart plotting several
-- targets: only the first survives, as the previous model stores one.
UPDATE dashboards d
SET widgets = (
    SELECT jsonb_agg(
        CASE
            WHEN w -> 'config' ->> 'type' = 'chart' AND w -> 'config' ? 'targets'
            THEN jsonb_set(
                w,
                '{config}',
                ((w -> 'config') - 'targets')
                || jsonb_build_object('target', w -> 'config' -> 'targets' -> 0)
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
    WHERE w -> 'config' ->> 'type' = 'chart' AND w -> 'config' ? 'targets'
);
