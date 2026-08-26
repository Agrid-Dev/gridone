-- depends: 0006.devices-manager-drop-transport-connection-state

-- A device's type is derived from its driver at assembly and was never
-- read back from this column (AGR-918): drop the dead denormalization.

ALTER TABLE dm_devices DROP COLUMN type;
