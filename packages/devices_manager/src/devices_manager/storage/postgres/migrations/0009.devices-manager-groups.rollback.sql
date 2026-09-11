DROP TRIGGER dm_devices_group_integrity ON dm_devices;
DROP TRIGGER dm_devices_groups_lock ON dm_devices;
DROP TABLE dm_device_groups;
DROP FUNCTION dm_device_group_integrity();
DROP FUNCTION dm_validate_group();
DROP FUNCTION dm_lock_groups();
