-- depends: 0003.dashboards-icon

-- A chart widget now plots a list of targets (``config.targets``). Rewrites
-- both shapes stored so far into it, so the config model reads one shape and
-- carries no upgrade-on-read code:
--   {"target": {...}}                 -> {"targets": [{...}]}
--   {"device_id": ..., "attribute": ...}  (the pre-target shape)
--       -> {"targets": [{"devices": {"ids": [device_id]}, "attribute": ...}]}
UPDATE dashboards d
SET widgets = (
    SELECT jsonb_agg(
        CASE
            WHEN w -> 'config' ->> 'type' = 'chart'
                AND NOT (w -> 'config' ? 'targets')
            THEN jsonb_set(
                w,
                '{config}',
                ((w -> 'config') - 'target' - 'device_id' - 'attribute')
                || jsonb_build_object(
                    'targets',
                    jsonb_build_array(
                        COALESCE(
                            w -> 'config' -> 'target',
                            jsonb_build_object(
                                'devices',
                                jsonb_build_object(
                                    'ids',
                                    jsonb_build_array(w -> 'config' -> 'device_id')
                                ),
                                'attribute',
                                w -> 'config' -> 'attribute'
                            )
                        )
                    )
                )
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
    WHERE w -> 'config' ->> 'type' = 'chart'
        AND NOT (w -> 'config' ? 'targets')
);
