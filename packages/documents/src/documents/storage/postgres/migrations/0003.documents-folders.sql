-- depends: 0002.documents-remove-sharing

CREATE TABLE document_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES document_folders (id),
    archived_at TIMESTAMPTZ,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX document_folders_parent_idx ON document_folders (parent_id);

-- Existing documents stay at the top level and active. The foreign keys have no
-- ON DELETE: the database itself refuses to delete a folder that still holds
-- a document or a subfolder, archived ones included.
ALTER TABLE documents
    ADD COLUMN folder_id TEXT REFERENCES document_folders (id),
    ADD COLUMN archived_at TIMESTAMPTZ;
CREATE INDEX documents_folder_idx ON documents (folder_id, created_at DESC, id DESC);
