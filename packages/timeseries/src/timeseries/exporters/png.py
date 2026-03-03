from __future__ import annotations

import colorsys
import io
from typing import TYPE_CHECKING

import matplotlib as mpl
import matplotlib.pyplot as plt

from timeseries.domain import DataType

if TYPE_CHECKING:
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


_LEGEND_KW: dict = {
    "bbox_to_anchor": (1.01, 1),
    "loc": "upper left",
    "borderaxespad": 0,
    "frameon": False,
}
_NUM_H = 3.5
_CAT_H = 0.9
_FIG_W = 12.0


def _plot_categorical(ax: Axes, s: TimeSeries) -> None:
    ts = [p.timestamp for p in s.data_points]

    if s.data_type == DataType.BOOL:
        ys = [1 if p.value else 0 for p in s.data_points]
        ax.fill_between(ts, ys, step="post", color=_COLORS[-1], alpha=0.3, zorder=0)
        ax.step(
            ts,
            ys,
            where="post",
            color=_COLORS[-1],
            linewidth=1,
            label=s.metric,
            zorder=1,
        )
    else:
        unique = sorted({str(p.value) for p in s.data_points})
        for i, val in enumerate(unique):
            c = _color(i)
            ys = [1 if str(p.value) == val else 0 for p in s.data_points]
            ax.fill_between(
                ts,
                ys,
                step="post",
                color=c,
                alpha=0.35,
                label=f"{s.metric}: {val}",
                zorder=0,
            )

    ax.set_yticks([])
    ax.set_ylim(-0.1, 1.1)


def to_figure(series: list[TimeSeries], *, title: str | None = None) -> Figure:
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

    idx = 0
    if num_series:
        ax = axs[idx]
        idx += 1
        for i, s in enumerate(num_series):
            ts = [p.timestamp for p in s.data_points]
            vs = [float(p.value) for p in s.data_points]
            ax.plot(ts, vs, label=s.metric, color=_color(i))

    for s in cat_series:
        _plot_categorical(axs[idx], s)
        idx += 1

    for ax in axs[:idx]:
        ax.grid(axis="x", linestyle="--", alpha=0.7, zorder=3)
        ax.legend(**_LEGEND_KW)

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
