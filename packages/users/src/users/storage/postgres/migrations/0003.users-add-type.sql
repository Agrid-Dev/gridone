-- depends: 0002.users-is-admin-to-role

ALTER TABLE users ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'user';
