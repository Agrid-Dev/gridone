-- depends:

DO $$ BEGIN
    CREATE TYPE data_type AS ENUM ('int', 'float', 'str', 'bool');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE command_status AS ENUM ('pending', 'success', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- If the old enum exists without 'pending', add it.
-- This handles the case where timeseries was initialized first with
-- command_status = ('success', 'error').
-- ADD VALUE cannot run inside a transaction, so this must be committed
-- before any table uses the new value.
ALTER TYPE command_status ADD VALUE IF NOT EXISTS 'pending' BEFORE 'success';
