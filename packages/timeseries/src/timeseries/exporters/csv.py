from __future__ import annotations

import csv
import io
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from datetime import datetime

    from timeseries.domain import DataPointValue, TimeSeries


def to_csv(series: list[TimeSeries]) -> str:
    all_timestamps: list[datetime] = sorted(
        {p.timestamp for s in series for p in s.data_points}
    )
    series_point_maps = [{p.timestamp: p.value for p in s.data_points} for s in series]

    with io.StringIO() as sio:
        writer = csv.writer(sio)
        writer.writerow(["timestamp"] + [s.metric for s in series])

        last_values: list[DataPointValue | None] = [None] * len(series)
        for ts in all_timestamps:
            for i, point_map in enumerate(series_point_maps):
                if ts in point_map:
                    last_values[i] = point_map[ts]
            row = [ts.isoformat()] + [v if v is not None else "" for v in last_values]
            writer.writerow(row)

        return sio.getvalue()
