-- depends: 0002.dashboards-position

-- The icon the author picked for the sidebar entry, one key of the UI-drawn
-- vocabulary (validated by the service), or NULL for none.
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS icon TEXT;
