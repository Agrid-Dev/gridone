-- depends: 0008.devices-manager-presentation-resources

CREATE TABLE dm_device_groups (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    driver_id TEXT GENERATED ALWAYS AS (data->>'driver_id') STORED NOT NULL
        REFERENCES dm_drivers(id)
);
CREATE INDEX dm_device_groups_driver ON dm_device_groups(driver_id);
CREATE INDEX dm_device_groups_members ON dm_device_groups USING gin ((data->'device_ids'));

-- Serialize group and device structural mutations before checking membership.
-- This also protects against a second process bypassing the service's lock.
CREATE FUNCTION dm_lock_groups() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(1231001);
    RETURN NULL;
END;
$$;
CREATE TRIGGER dm_groups_lock BEFORE INSERT OR UPDATE OR DELETE ON dm_device_groups
    FOR EACH STATEMENT EXECUTE FUNCTION dm_lock_groups();
CREATE TRIGGER dm_devices_groups_lock BEFORE UPDATE OR DELETE ON dm_devices
    FOR EACH STATEMENT EXECUTE FUNCTION dm_lock_groups();

CREATE FUNCTION dm_validate_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(NEW.data->'device_ids') AS member(id)
        LEFT JOIN dm_devices d ON d.id = member.id
        WHERE d.id IS NULL OR d.driver_id IS DISTINCT FROM NEW.data->>'driver_id'
    ) THEN
        RAISE EXCEPTION 'Invalid device group membership' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER dm_groups_validate BEFORE INSERT OR UPDATE ON dm_device_groups
    FOR EACH ROW EXECUTE FUNCTION dm_validate_group();

CREATE FUNCTION dm_device_group_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE dm_device_groups SET data = jsonb_set(
            jsonb_set(data, '{device_ids}', (data->'device_ids') - OLD.id),
            '{updated_at}', to_jsonb(CURRENT_TIMESTAMP)
        ) WHERE data->'device_ids' ? OLD.id;
        RETURN OLD;
    END IF;
    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id AND EXISTS (
        SELECT 1 FROM dm_device_groups WHERE data->'device_ids' ? OLD.id
    ) THEN
        RAISE EXCEPTION 'Device belongs to a group' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER dm_devices_group_integrity BEFORE UPDATE OR DELETE ON dm_devices
    FOR EACH ROW EXECUTE FUNCTION dm_device_group_integrity();
