-- Synoptics: plate documents, stored document-oriented.
--
-- One row per plate. The whole authored document (version, projection,
-- defaults, symbols, pipes and labels) lives in the ``document`` JSONB
-- column, because a plate is authored, validated and read as one unit.
--
-- The envelope fields an index needs (name, description, projection) are NOT
-- copied into columns: ``list_summaries`` reads them straight out of the JSONB
-- so they can never drift from the document they describe.

CREATE TABLE IF NOT EXISTS synoptics (
    id          TEXT         PRIMARY KEY,
    document    JSONB        NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- The plate index (``list``) orders by creation time.
CREATE INDEX IF NOT EXISTS idx_synoptics_created_at ON synoptics (created_at);
