-- depends: 0004.users-add-is-blocked

ALTER TABLE users DROP COLUMN IF EXISTS is_blocked;
