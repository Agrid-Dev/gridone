-- depends: 0006.dashboards-type

-- The navigation structure: one document arranging dashboards at the root,
-- in groups (an entry whose dashboards are tabs) or in sections (a
-- collapsible heading). Sections and groups live only in the document,
-- with their label and icon inline; dashboards are referenced by id. The
-- document replaces the flat ``position`` order: it is seeded from it, so
-- the flat order of today is the root order of tomorrow.
CREATE TABLE IF NOT EXISTS dashboard_structure (
    id          INTEGER      PRIMARY KEY CHECK (id = 1),
    items       JSONB        NOT NULL DEFAULT '[]'::jsonb,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO dashboard_structure (id, items)
SELECT 1, COALESCE(
    jsonb_agg(jsonb_build_object('kind', 'dashboard', 'id', id)
              ORDER BY position, created_at, id),
    '[]'::jsonb)
FROM dashboards
ON CONFLICT (id) DO NOTHING;

ALTER TABLE dashboards DROP COLUMN IF EXISTS position;
