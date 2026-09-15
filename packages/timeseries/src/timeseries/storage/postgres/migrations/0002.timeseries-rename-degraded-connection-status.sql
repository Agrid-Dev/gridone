-- depends: 0001.timeseries-initial

-- The devices manager renamed the intermediate connection status from
-- "degraded" to "unstable" (AGR-1252). Recorded history follows, so charts and
-- exports use one term for one state.
--
-- Cost: the planner reaches the rows through the (series_id, timestamp)
-- primary key of each chunk, so it scales with the recorded connection_status
-- changes, not with the size of ts_data_points. Measured at ~0.7 s for 50 000
-- rewritten points on a 10.9M-point hypertable (14 chunks). It runs once, at
-- the first start of the timeseries service after the upgrade.
UPDATE ts_data_points AS point
SET value_string = 'unstable'
FROM ts_series AS series
WHERE point.series_id = series.id
  AND series.metric = 'connection_status'
  AND point.value_string = 'degraded';
