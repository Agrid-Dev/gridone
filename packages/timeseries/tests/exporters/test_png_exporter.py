from __future__ import annotations

from datetime import UTC, datetime

import matplotlib.pyplot as plt
import pytest
from timeseries.domain import DataPoint, DataType, TimeSeries
from timeseries.exporters.png import to_figure

T1 = datetime(2024, 1, 1, tzinfo=UTC)
T2 = datetime(2024, 1, 2, tzinfo=UTC)


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

    def test_bool_series_on_secondary_axis(self):
        s = make_series(
            DataType.BOOLEAN,
            "state",
            [DataPoint(timestamp=T1, value=True), DataPoint(timestamp=T2, value=False)],
        )
        fig = to_figure([s])
        assert len(fig.axes) == 2
        ax_bool = fig.axes[1]
        assert list(ax_bool.get_yticks()) == [0, 1]
        assert [t.get_text() for t in ax_bool.get_yticklabels()] == ["False", "True"]

    def test_bool_label_in_primary_legend(self):
        float_s = make_series(
            DataType.FLOAT, "temperature", [DataPoint(timestamp=T1, value=22.0)]
        )
        bool_s = make_series(
            DataType.BOOLEAN, "state", [DataPoint(timestamp=T1, value=True)]
        )
        fig = to_figure([float_s, bool_s])
        legend = fig.axes[0].get_legend()
        assert legend is not None
        labels = [t.get_text() for t in legend.get_texts()]
        assert "temperature" in labels
        assert "state" in labels

    def test_string_series_skipped(self):
        s = make_series(
            DataType.STRING, "status", [DataPoint(timestamp=T1, value="ok")]
        )
        fig = to_figure([s])
        assert fig.axes[0].get_legend() is None

    def test_empty_series_produces_no_legend(self):
        s = make_series(DataType.FLOAT, "temp", [])
        fig = to_figure([s])
        assert fig.axes[0].get_legend() is None
