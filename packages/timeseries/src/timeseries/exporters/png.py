from __future__ import annotations

import colorsys
import io
from typing import TYPE_CHECKING

import matplotlib as mpl
import matplotlib.pyplot as plt

from timeseries.domain import DataType

if TYPE_CHECKING:
    from datetime import datetime

    from matplotlib.axes import Axes
    from matplotlib.figure import Figure

    from timeseries.domain import TimeSeries

mpl.use("Agg")


def _hsl(h: int, s: int, lum: int) -> str:
    r, g, b = colorsys.hls_to_rgb(h / 360, lum / 100, s / 100)
    return f"#{round(r * 255):02x}{round(g * 255):02x}{round(b * 255):02x}"


_COLORS = [
    _hsl(234, 89, 74),
    _hsl(160, 84, 39),
    _hsl(43, 96, 56),
    _hsl(0, 84, 60),
    _hsl(262, 83, 58),
    _hsl(187, 85, 53),
    _hsl(24, 95, 53),
    _hsl(330, 81, 60),
]
_CAT_TYPES = (DataType.BOOL, DataType.STRING)


def _color(i: int) -> str:
    return _COLORS[i % len(_COLORS)]


_NUM_H = 3.5
_CAT_H = 0.9
_FIG_W = 12.0


def _extend(ts: list, vals: list, end: datetime) -> tuple[list, list]:
    if ts and ts[-1] < end:
        return [*ts, end], [*vals, vals[-1]]
    return ts, vals


def _plot_categorical(ax: Axes, s: TimeSeries, end: datetime | None) -> None:
    ts = [p.timestamp for p in s.data_points]
    is_bool = s.data_type == DataType.BOOL
    raw = (
        [1 if p.value else 0 for p in s.data_points]
        if is_bool
        else [str(p.value) for p in s.data_points]
    )
    if end:
        ts, raw = _extend(ts, raw, end)

    if is_bool:
        ax.fill_between(
            ts,  # ty: ignore[invalid-argument-type]
            0,
            raw,
            step="post",
            color=_COLORS[-1],
            alpha=0.25,
            zorder=0,
        )
        ax.step(
            ts,  # ty: ignore[invalid-argument-type]
            raw,
            where="post",
            color=_COLORS[-1],
            linewidth=1.5,
            label=s.metric,
            zorder=2,
        )
    else:
        for i, val in enumerate(sorted(set(raw))):
            ax.fill_between(
                ts,  # ty: ignore[invalid-argument-type]
                0,
                1,
                where=[v == val for v in raw],
                step="post",
                color=_color(i),
                alpha=0.35,
                zorder=0,
                label=f"{s.metric}: {val}",
            )

    ax.set_yticks([])
    ax.set_ylim(-0.1, 1.1)


def to_figure(
    series: list[TimeSeries],
    *,
    title: str | None = None,
    end: datetime | None = None,
) -> Figure:
    num_series = [s for s in series if s.data_points and s.data_type not in _CAT_TYPES]
    cat_series = [s for s in series if s.data_points and s.data_type in _CAT_TYPES]

    n_num = 1 if num_series else 0
    n_panels = n_num + len(cat_series) or 1
    ratios = ([5] if num_series else []) + [1] * len(cat_series)
    fig_h = max(_NUM_H * n_num + _CAT_H * len(cat_series), _CAT_H)
    gskw = {"height_ratios": ratios} if n_panels > 1 else {}

    fig, axes = plt.subplots(
        n_panels,
        1,
        sharex=True,
        figsize=(_FIG_W, fig_h),
        gridspec_kw=gskw,
        layout="constrained",
    )
    axs = [axes] if n_panels == 1 else list(axes)

    all_ts = [p.timestamp for s in series for p in s.data_points]
    data_end = end or (max(all_ts) if all_ts else None)

    if num_series:
        for i, s in enumerate(num_series):
            ts = [p.timestamp for p in s.data_points]
            ys = [float(p.value) for p in s.data_points]
            if data_end:
                ts, ys = _extend(ts, ys, data_end)
            axs[0].step(ts, ys, where="post", label=s.metric, color=_color(i))

    if cat_series:
        for i, s in enumerate(cat_series, start=n_num):
            _plot_categorical(axs[i], s, data_end)

    for ax in axs:
        ax.grid(axis="x", linestyle="--", alpha=0.7, zorder=3)
        if ax.get_legend_handles_labels()[0]:
            ax.legend(
                bbox_to_anchor=(1.01, 1),
                loc="upper left",
                borderaxespad=0,
                frameon=False,
            )

    fig.autofmt_xdate()
    if title is not None:
        fig.suptitle(title)

    return fig


def to_png(
    series: list[TimeSeries],
    *,
    title: str | None = None,
    end: datetime | None = None,
) -> bytes:
    fig = to_figure(series, title=title, end=end)
    try:
        buf = io.BytesIO()
        fig.savefig(buf, format="png")
        return buf.getvalue()
    finally:
        plt.close(fig)
