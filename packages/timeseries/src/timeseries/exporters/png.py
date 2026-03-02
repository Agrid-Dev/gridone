from __future__ import annotations

import io
from typing import TYPE_CHECKING

import matplotlib as mpl

mpl.use("Agg")

import matplotlib.pyplot as plt

if TYPE_CHECKING:
    from timeseries.domain import TimeSeries


def to_png(series: list[TimeSeries], *, title: str | None = None) -> bytes:
    fig, ax = plt.subplots()
    try:
        for s in series:
            timestamps = [p.timestamp for p in s.data_points]
            values = [
                float(int(p.value) if isinstance(p.value, bool) else p.value)
                for p in s.data_points
            ]
            ax.plot(timestamps, values, label=s.metric)

        ax.legend()
        fig.autofmt_xdate()
        if title is not None:
            fig.suptitle(title)

        buf = io.BytesIO()
        fig.savefig(buf, format="png")
        return buf.getvalue()
    finally:
        plt.close(fig)
