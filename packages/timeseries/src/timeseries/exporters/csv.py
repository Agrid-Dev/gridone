from __future__ import annotations

import csv
import io
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

if TYPE_CHECKING:
    from datetime import datetime

    from timeseries.domain import AttributeValueType, TimeSeries


def _trunc(ts: datetime) -> datetime:
    return ts.replace(microsecond=0)


def _localize(ts: datetime, tz: ZoneInfo) -> datetime:
    return _trunc(ts.astimezone(tz))


def to_csv(series: list[TimeSeries], *, timezone: str = "UTC") -> str:
    tz = ZoneInfo(timezone)
    all_timestamps: list[datetime] = sorted(
        {_localize(p.timestamp, tz) for s in series for p in s.data_points}
    )
    series_point_maps = [
        {_localize(p.timestamp, tz): p.value for p in s.data_points} for s in series
    ]

    with io.StringIO() as sio:
        writer = csv.writer(sio)
        writer.writerow(["timestamp"] + [s.metric for s in series])

        last_values: list[AttributeValueType | None] = [None] * len(series)
        for ts in all_timestamps:
            for i, point_map in enumerate(series_point_maps):
                if ts in point_map:
                    last_values[i] = point_map[ts]
            row = [ts.isoformat()] + [v if v is not None else "" for v in last_values]
            writer.writerow(row)

        return sio.getvalue()
