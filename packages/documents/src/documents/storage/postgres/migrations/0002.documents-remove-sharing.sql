-- depends: 0001.documents-initial

-- Early installations of PR #795 had this column. Preserve their documents
-- while removing sharing; on a fresh database this is a no-op.
ALTER TABLE documents DROP COLUMN IF EXISTS allowed_role_ids;
