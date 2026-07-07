-- depends: 0003.devices-manager-tags

-- Virtual devices are retired (AGR-886): every device now has a driver and a
-- transport. Remaining virtual rows have neither and cannot be loaded, so they
-- are dropped along with the kind discriminator column.

DELETE FROM dm_devices WHERE kind = 'virtual';

ALTER TABLE dm_devices DROP COLUMN kind;
