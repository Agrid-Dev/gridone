-- depends: 0001.timeseries-initial

-- The devices manager renamed the intermediate connection status from
-- "degraded" to "unstable" (AGR-1252). Recorded history follows, so charts and
-- exports use one term for one state.
UPDATE ts_data_points AS point
SET value_string = 'unstable'
FROM ts_series AS series
WHERE point.series_id = series.id
  AND series.metric = 'connection_status'
  AND point.value_string = 'degraded';
