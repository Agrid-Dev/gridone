-- depends:

CREATE TABLE IF NOT EXISTS users (
    id                   TEXT PRIMARY KEY,
    username             TEXT UNIQUE NOT NULL,
    hashed_password      TEXT NOT NULL,
    role                 TEXT NOT NULL,
    name                 TEXT NOT NULL DEFAULT '',
    email                TEXT NOT NULL DEFAULT '',
    title                TEXT NOT NULL DEFAULT '',
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE
);
