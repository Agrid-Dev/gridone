-- Dashboards: UI widget containers, stored document-oriented.
--
-- Each row is a whole dashboard. Its widgets — including each widget's grid
-- geometry (x, y, w, h) and per-widget metadata — live in the ``widgets``
-- JSONB list. The react-grid-layout ``layout`` array is derived from each
-- widget's geometry at read time, so it is NOT stored as a separate column;
-- this keeps the "exactly one layout item per widget" invariant free.

CREATE TABLE IF NOT EXISTS dashboards (
    id          TEXT         PRIMARY KEY,
    name        TEXT         NOT NULL,
    description TEXT,
    widgets     JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- The dashboard index (``list``) orders by creation time.
CREATE INDEX IF NOT EXISTS idx_dashboards_created_at ON dashboards (created_at);
