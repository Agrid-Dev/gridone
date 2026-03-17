-- depends: 0003.users-add-type

ALTER TABLE users DROP COLUMN IF EXISTS type;
