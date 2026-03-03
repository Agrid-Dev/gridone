from __future__ import annotations

import io
from typing import TYPE_CHECKING

import matplotlib as mpl

mpl.use("Agg")

import matplotlib.pyplot as plt

from timeseries.domain import DataType

if TYPE_CHECKING:
    from matplotlib.figure import Figure

    from timeseries.domain import TimeSeries


def to_figure(series: list[TimeSeries], *, title: str | None = None) -> Figure:
    fig, ax = plt.subplots()
    ax_bool = None

    for s in series:
        if not s.data_points or s.data_type == DataType.STRING:
            continue

        timestamps = [p.timestamp for p in s.data_points]

        if s.data_type == DataType.BOOL:
            if ax_bool is None:
                ax_bool = ax.twinx()
                ax_bool.set_ylim(-0.1, 1.1)
                ax_bool.set_yticks([0, 1])
                ax_bool.set_yticklabels(["False", "True"])
            values = [int(p.value) for p in s.data_points]
            ax_bool.step(timestamps, values, where="post", label=s.metric)
        else:
            values = [float(p.value) for p in s.data_points]
            ax.plot(timestamps, values, label=s.metric)

    handles, labels = ax.get_legend_handles_labels()
    if ax_bool is not None:
        bool_handles, bool_labels = ax_bool.get_legend_handles_labels()
        handles += bool_handles
        labels += bool_labels
    if handles:
        ax.legend(handles, labels)

    fig.autofmt_xdate()
    if title is not None:
        fig.suptitle(title)

    return fig


def to_png(series: list[TimeSeries], *, title: str | None = None) -> bytes:
    fig = to_figure(series, title=title)
    try:
        buf = io.BytesIO()
        fig.savefig(buf, format="png")
        return buf.getvalue()
    finally:
        plt.close(fig)
