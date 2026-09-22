-- depends: 0004.users-add-is-blocked

-- Custom roles (ADR 0004). Built-in roles stay in code and are never rows
-- here, so users.role carries no foreign key: the users service enforces
-- both directions of the reference itself.
CREATE TABLE IF NOT EXISTS roles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    scopes      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
