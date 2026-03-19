-- depends: 0002.drop-type-column

CREATE TABLE IF NOT EXISTS apps (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    api_url     TEXT NOT NULL,
    icon        TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'registered',
    manifest    TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
