-- depends: 0005.devices-manager-created-updated-at

-- Connection state is live runtime status, not durable configuration
-- (AGR-918): transports always hydrate idle, so the column is dead data.

ALTER TABLE dm_transports DROP COLUMN connection_state;
