UPDATE ts_data_points AS point
SET value_string = 'degraded'
FROM ts_series AS series
WHERE point.series_id = series.id
  AND series.metric = 'connection_status'
  AND point.value_string = 'unstable';
