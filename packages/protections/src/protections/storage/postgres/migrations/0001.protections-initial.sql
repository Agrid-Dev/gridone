CREATE TABLE protection_revisions (
    id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    document JSONB NOT NULL,
    PRIMARY KEY (id, revision)
);
