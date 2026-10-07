-- ``position`` comes back as the document's depth-first order; dashboards
-- the document does not place follow, in creation order.
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS position INTEGER;

WITH root AS (
    SELECT item, ord
    FROM dashboard_structure, jsonb_array_elements(items) WITH ORDINALITY AS r(item, ord)
),
placed AS (
    SELECT r.ord AS o0, 0::bigint AS o1, 0::bigint AS o2, r.item ->> 'id' AS id
    FROM root r
    WHERE r.item ->> 'kind' = 'dashboard'
    UNION ALL
    SELECT r.ord, 0, g.ord, g.id
    FROM root r, jsonb_array_elements_text(r.item -> 'dashboards') WITH ORDINALITY AS g(id, ord)
    WHERE r.item ->> 'kind' = 'group'
    UNION ALL
    SELECT r.ord, s.ord, 0, s.item ->> 'id'
    FROM root r, jsonb_array_elements(r.item -> 'items') WITH ORDINALITY AS s(item, ord)
    WHERE r.item ->> 'kind' = 'section' AND s.item ->> 'kind' = 'dashboard'
    UNION ALL
    SELECT r.ord, s.ord, g.ord, g.id
    FROM root r,
         jsonb_array_elements(r.item -> 'items') WITH ORDINALITY AS s(item, ord),
         jsonb_array_elements_text(s.item -> 'dashboards') WITH ORDINALITY AS g(id, ord)
    WHERE r.item ->> 'kind' = 'section' AND s.item ->> 'kind' = 'group'
),
ranked AS (
    SELECT d.id,
           ROW_NUMBER() OVER (
               ORDER BY p.id IS NULL, p.o0, p.o1, p.o2, d.created_at, d.id
           ) - 1 AS position
    FROM dashboards d
    LEFT JOIN placed p ON p.id = d.id
)
UPDATE dashboards d
SET position = ranked.position
FROM ranked
WHERE d.id = ranked.id;

ALTER TABLE dashboards ALTER COLUMN position SET NOT NULL;

DROP TABLE IF EXISTS dashboard_structure;
