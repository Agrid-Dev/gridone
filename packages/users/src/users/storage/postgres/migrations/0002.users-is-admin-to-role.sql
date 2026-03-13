-- depends: 0001.users-initial

-- Migrate legacy is_admin boolean column to role text column.
-- No-op on databases created fresh from 0001 (role column already exists).
DO $$
DECLARE
    col_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'is_admin'
    ) INTO col_exists;

    IF col_exists THEN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'operator';
        UPDATE users SET role = 'admin' WHERE is_admin = TRUE AND role = 'operator';
        ALTER TABLE users DROP COLUMN is_admin;
    END IF;
END $$;
