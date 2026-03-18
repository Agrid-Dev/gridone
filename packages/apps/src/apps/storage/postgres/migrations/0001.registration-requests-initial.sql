-- depends:

CREATE TABLE IF NOT EXISTS registration_requests (
    id                TEXT PRIMARY KEY,
    username          TEXT NOT NULL,
    hashed_password   TEXT NOT NULL,
    type              TEXT NOT NULL DEFAULT 'user',
    status            TEXT NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    config            TEXT NOT NULL DEFAULT ''
);
