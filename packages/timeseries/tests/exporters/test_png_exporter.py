from __future__ import annotations

from datetime import UTC, datetime

import matplotlib.pyplot as plt
import pytest

from timeseries.domain import DataPoint, DataType, TimeSeries
from timeseries.exporters.png import to_figure

T1 = datetime(2024, 1, 1, tzinfo=UTC)
T2 = datetime(2024, 1, 2, tzinfo=UTC)
T3 = datetime(2024, 1, 3, tzinfo=UTC)


def make_series(
    data_type: DataType,
    metric: str,
    points: list[DataPoint],
) -> TimeSeries:
    s = TimeSeries(data_type=data_type, owner_id="d1", metric=metric)
    s.data_points = points
    return s


@pytest.fixture(autouse=True)
def close_figures():
    yield
    plt.close("all")


class TestToFigure:
    def test_title_set(self):
        s = make_series(DataType.FLOAT, "temp", [DataPoint(timestamp=T1, value=20.0)])
        fig = to_figure([s], title="My Chart")
        assert fig.texts[0].get_text() == "My Chart"

    def test_no_title_by_default(self):
        s = make_series(DataType.FLOAT, "temp", [DataPoint(timestamp=T1, value=20.0)])
        fig = to_figure([s])
        assert fig.texts == []

    def test_float_series_legend_label(self):
        s = make_series(
            DataType.FLOAT, "temperature", [DataPoint(timestamp=T1, value=20.0)]
        )
        fig = to_figure([s])
        legend = fig.axes[0].get_legend()
        assert legend is not None
        labels = [t.get_text() for t in legend.get_texts()]
        assert "temperature" in labels

    def test_bool_series_own_panel(self):
        s = make_series(
            DataType.BOOL,
            "state",
            [DataPoint(timestamp=T1, value=True), DataPoint(timestamp=T2, value=False)],
        )
        fig = to_figure([s])
        assert len(fig.axes) == 1
        labels = [t.get_text() for t in fig.axes[0].get_legend().get_texts()]  # ty: ignore[unresolved-attribute]
        assert "state" in labels

    def test_float_and_bool_in_separate_panels(self):
        float_s = make_series(
            DataType.FLOAT, "temperature", [DataPoint(timestamp=T1, value=22.0)]
        )
        bool_s = make_series(
            DataType.BOOL, "state", [DataPoint(timestamp=T1, value=True)]
        )
        fig = to_figure([float_s, bool_s])
        assert len(fig.axes) == 2
        float_labels = [t.get_text() for t in fig.axes[0].get_legend().get_texts()]  # ty: ignore[unresolved-attribute]
        bool_labels = [t.get_text() for t in fig.axes[1].get_legend().get_texts()]  # ty: ignore[unresolved-attribute]
        assert "temperature" in float_labels
        assert "state" in bool_labels

    def test_string_series_own_panel(self):
        s = make_series(
            DataType.STRING, "status", [DataPoint(timestamp=T1, value="ok")]
        )
        fig = to_figure([s])
        assert len(fig.axes) == 1
        labels = [t.get_text() for t in fig.axes[0].get_legend().get_texts()]  # ty: ignore[unresolved-attribute]
        assert "status: ok" in labels

    def test_all_series_extended_to_same_end(self):
        float_s = make_series(
            DataType.FLOAT, "temp", [DataPoint(timestamp=T1, value=20.0)]
        )
        bool_s = make_series(
            DataType.BOOL, "state", [DataPoint(timestamp=T2, value=True)]
        )
        fig = to_figure([float_s, bool_s], end=T3)
        for ax in fig.axes:
            for line in ax.get_lines():
                if line.get_xdata().size:  # ty: ignore[unresolved-attribute]
                    assert max(line.get_xdata()) == T3  # ty: ignore[invalid-argument-type]

    def test_empty_series_produces_no_legend(self):
        s = make_series(DataType.FLOAT, "temp", [])
        fig = to_figure([s])
        assert fig.axes[0].get_legend() is None
