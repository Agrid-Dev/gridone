"""Alert episodes rebuilt from the changes a fault attribute's series recorded."""

from datetime import UTC, datetime, timedelta

import pytest

from api.fault_episodes import (
    Episode,
    fault_series,
    overlaps,
    reconstruct_episodes,
)
from devices_manager import Attribute, FaultAttribute
from devices_manager.dto.device_dto import Device
from models.types import AttributeValueType, DataType, Severity
from timeseries.domain import DataPoint, SeriesKey

T0 = datetime(2026, 10, 14, 7, 0, tzinfo=UTC)


def at(minutes: float) -> datetime:
    return T0 + timedelta(minutes=minutes)


def point(minutes: float, value: AttributeValueType) -> DataPoint:
    return DataPoint(timestamp=at(minutes), value=value)


def opened(minutes: float) -> DataPoint:
    """The window reads open: a fault."""
    return point(minutes, value=True)


def closed(minutes: float) -> DataPoint:
    return point(minutes, value=False)


def window(start: float, end: float | None) -> Episode:
    """An open-window episode, ongoing when ``end`` is None."""
    return Episode(
        started_at=at(start),
        ended_at=None if end is None else at(end),
        value=True,
    )


def window_open(value: AttributeValueType | None) -> bool:
    return value is True


def fault_code(value: AttributeValueType | None) -> bool:
    return value not in (None, 0)


class TestReconstructEpisodes:
    def test_closes_an_episode_when_the_value_turns_healthy(self):
        # 07:12 true, 07:58 false, 13:30 true: two episodes, the last one on.
        points = [opened(12), closed(58), opened(390)]
        assert reconstruct_episodes(points, previous=None, is_faulty=window_open) == [
            window(12, 58),
            window(390, None),
        ]

    def test_keeps_the_onset_of_an_episode_open_before_the_period(self):
        episodes = reconstruct_episodes(
            [closed(30)], previous=opened(-120), is_faulty=window_open
        )
        assert episodes == [window(-120, 30)]

    def test_an_episode_open_before_the_period_and_still_on_is_ongoing(self):
        episodes = reconstruct_episodes(
            [], previous=opened(-120), is_faulty=window_open
        )
        assert episodes == [window(-120, None)]

    def test_a_healthy_history_has_no_episode(self):
        episodes = reconstruct_episodes(
            [closed(10)], previous=closed(-5), is_faulty=window_open
        )
        assert episodes == []

    def test_successive_faulty_values_make_one_episode(self):
        # A changing fault code, or one written again after unknown readings,
        # does not reopen the episode; it keeps its opening value.
        points = [point(0, 3), point(10, 5), point(20, 5), point(30, 0)]
        assert reconstruct_episodes(points, previous=None, is_faulty=fault_code) == [
            Episode(started_at=at(0), ended_at=at(30), value=3)
        ]

    def test_merges_episodes_less_than_a_minute_apart(self):
        points = [opened(0), closed(5), opened(5.5), closed(9)]
        assert reconstruct_episodes(points, previous=None, is_faulty=window_open) == [
            window(0, 9)
        ]

    def test_a_bounce_into_an_ongoing_episode_merges_it_too(self):
        points = [opened(0), closed(5), opened(5.5)]
        assert reconstruct_episodes(points, previous=None, is_faulty=window_open) == [
            window(0, None)
        ]

    def test_keeps_episodes_a_minute_or_more_apart(self):
        points = [opened(0), closed(5), opened(6), closed(9)]
        assert reconstruct_episodes(points, previous=None, is_faulty=window_open) == [
            window(0, 5),
            window(6, 9),
        ]


class TestOverlaps:
    @pytest.mark.parametrize(
        ("episode", "expected"),
        [
            pytest.param(window(-60, -10), False, id="ended-before"),
            pytest.param(window(-60, 0), True, id="ends-as-it-opens"),
            pytest.param(window(-60, None), True, id="still-on"),
            pytest.param(window(30, 90), True, id="runs-past-the-end"),
            pytest.param(window(70, 80), False, id="starts-after"),
        ],
    )
    def test_keeps_the_episodes_that_share_time_with_the_period(
        self, episode: Episode, expected: bool
    ):
        assert overlaps(episode, start=at(0), end=at(60)) is expected


WINDOW = FaultAttribute(
    name="window_open",
    data_type=DataType.BOOL,
    read_write_modes={"read"},
    healthy_values=[False],
    severity=Severity.WARNING,
)
CODE = FaultAttribute(
    name="fault_code",
    data_type=DataType.INT,
    read_write_modes={"read"},
    healthy_values=[0],
    severity=Severity.ALERT,
)
TEMPERATURE = Attribute.create("temperature", DataType.FLOAT, {"read"})


def _device(*attributes: Attribute) -> Device:
    return Device(
        id="room-203",
        name="Chambre 203",
        type="thermostat",
        attributes={a.name: a for a in attributes},
        config={},
        driver_id="thermostat",
        transport_id="mqtt",
    )


class TestFaultSeries:
    def test_lists_the_fault_attributes_only(self):
        series = fault_series([_device(WINDOW, TEMPERATURE, CODE)], severity=None)
        assert [s.attribute.name for s in series] == ["window_open", "fault_code"]
        assert series[0].key == SeriesKey(owner_id="room-203", metric="window_open")
        assert series[0].device_name == "Chambre 203"
        assert series[0].device_type == "thermostat"

    def test_filters_by_severity(self):
        series = fault_series([_device(WINDOW, CODE)], severity=Severity.ALERT)
        assert [s.attribute.name for s in series] == ["fault_code"]
