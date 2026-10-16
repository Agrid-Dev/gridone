"""Alert episodes rebuilt from the changes a fault attribute's series recorded."""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest

from api.access import ScopedDeviceReads
from api.fault_episodes import (
    Episode,
    fault_series,
    overlaps,
    read_fault_episodes,
    reconstruct_episodes,
)
from devices_manager import Attribute, FaultAttribute
from devices_manager.dto.device_dto import Device
from devices_manager.dto.driver_labels_dto import AttributeLabels, DriverLabels
from models.attribute_metadata import LocalizedText
from models.types import AttributeValueType, DataType, Severity
from timeseries import TimeSeriesService
from timeseries.domain import (
    DataPoint,
    FetchPointsBeforeResult,
    FetchPointsResult,
    SeriesKey,
)

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
        assert reconstruct_episodes(points, is_faulty=window_open) == [
            window(12, 58),
            window(390, None),
        ]

    def test_keeps_the_onset_of_an_episode_open_before_the_period(self):
        episodes = reconstruct_episodes(
            [opened(-120), closed(30)], is_faulty=window_open
        )
        assert episodes == [window(-120, 30)]

    def test_an_episode_open_before_the_period_and_still_on_is_ongoing(self):
        episodes = reconstruct_episodes([opened(-120)], is_faulty=window_open)
        assert episodes == [window(-120, None)]

    def test_a_healthy_history_has_no_episode(self):
        episodes = reconstruct_episodes([closed(-5), closed(10)], is_faulty=window_open)
        assert episodes == []

    def test_successive_faulty_values_make_one_episode(self):
        # A changing fault code, or one written again after unknown readings,
        # does not reopen the episode; it keeps its opening value.
        points = [point(0, 3), point(10, 5), point(20, 5), point(30, 0)]
        assert reconstruct_episodes(points, is_faulty=fault_code) == [
            Episode(started_at=at(0), ended_at=at(30), value=3)
        ]

    def test_merges_episodes_less_than_a_minute_apart(self):
        points = [opened(0), closed(5), opened(5.5), closed(9)]
        assert reconstruct_episodes(points, is_faulty=window_open) == [window(0, 9)]

    def test_a_bounce_into_an_ongoing_episode_merges_it_too(self):
        points = [opened(0), closed(5), opened(5.5)]
        assert reconstruct_episodes(points, is_faulty=window_open) == [window(0, None)]

    def test_keeps_episodes_a_minute_or_more_apart(self):
        points = [opened(0), closed(5), opened(6), closed(9)]
        assert reconstruct_episodes(points, is_faulty=window_open) == [
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


@pytest.fixture
def reads():
    reads = MagicMock(spec=ScopedDeviceReads)
    reads.list_devices.return_value = [_device(CODE)]
    reads.get_driver_labels.return_value = DriverLabels(
        revision="r1",
        attributes={
            "fault_code": AttributeLabels(label=LocalizedText(default="Alarm"))
        },
    )
    return reads


@pytest.fixture
def series_reader():
    """A service-boundary mock with the public paging semantics in both directions."""
    ts = MagicMock(spec=TimeSeriesService)

    def with_points(points) -> MagicMock:
        async def backward(_key, *, before, limit) -> FetchPointsBeforeResult:
            found = [p for p in reversed(points) if p.timestamp < before]
            page = found[:limit]
            return FetchPointsBeforeResult(
                page,
                len(found) > limit,
                page[-1].timestamp if len(found) > limit else None,
            )

        async def forward(_key, *, start, end, limit) -> FetchPointsResult:
            found = [p for p in points if start <= p.timestamp <= end]
            return FetchPointsResult(
                found[:limit],
                len(found) > limit,
                found[limit].timestamp if len(found) > limit else None,
            )

        ts.fetch_points_before.side_effect = backward
        ts.fetch_points.side_effect = forward
        return ts

    return with_points


@pytest.mark.asyncio
class TestReadEpisodes:
    @pytest.mark.parametrize("page_size", [1, 2, 3, 10_000])
    @pytest.mark.parametrize(("gap", "expected_start"), [(0.5, -10), (1, 0.75)])
    async def test_original_onset_value_and_window_bounces(  # noqa: PLR0913
        self, reads, series_reader, monkeypatch, page_size, gap, expected_start
    ):
        monkeypatch.setattr("api.fault_episodes.PAGE_SIZE", page_size)
        points = [
            point(-10, 3),
            point(-5, 7),
            point(-0.25, 0),
            point(-0.25 + gap, 8),
            point(5, 0),
        ]
        result = await read_fault_episodes(
            reads, series_reader(points), start=at(0), end=at(2), as_of=at(10)
        )
        assert not result.truncated
        assert len(result.episodes) == 1
        assert result.episodes[0].started_at == at(expected_start)
        assert result.episodes[0].value == (3 if gap < 1 else 8)
        assert result.episodes[0].ended_at == at(5)
        assert result.episodes[0].label == LocalizedText(default="Alarm")

    async def test_recovers_after_first_ten_thousand_points(self, reads, series_reader):
        points = [point(i / 60, 1) for i in range(10_000)] + [point(10_000 / 60, 0)]
        ts = series_reader(points)
        result = await read_fault_episodes(
            reads, ts, start=at(0), end=at(1), as_of=at(200)
        )
        assert not result.truncated
        assert result.episodes[0].ended_at == points[-1].timestamp
        assert ts.fetch_points.await_count == 2

    @pytest.mark.parametrize("start", [-1, 10])
    async def test_budget_never_implies_ongoing(
        self, reads, series_reader, monkeypatch, start
    ):
        monkeypatch.setattr("api.fault_episodes.POINT_BUDGET", 3)
        ts = series_reader([point(i, 1) for i in range(10)] + [point(20, 0)])
        result = await read_fault_episodes(
            reads, ts, start=at(start), end=at(15), as_of=at(30)
        )
        assert result.truncated
        assert result.episodes == []

    async def test_keeps_only_verified_closures_when_budget_exhausted(
        self, reads, series_reader, monkeypatch
    ):
        monkeypatch.setattr("api.fault_episodes.POINT_BUDGET", 4)
        ts = series_reader(
            [point(0, 1), point(1, 0), point(2, 2), point(3, 3), point(4, 0)]
        )
        result = await read_fault_episodes(
            reads, ts, start=at(0), end=at(10), as_of=at(10)
        )
        assert result.truncated
        assert [(e.started_at, e.ended_at) for e in result.episodes] == [(at(0), at(1))]

    async def test_does_not_certify_closure_before_unread_bounce(
        self, reads, series_reader, monkeypatch
    ):
        monkeypatch.setattr("api.fault_episodes.POINT_BUDGET", 2)
        ts = series_reader([point(0, 1), point(1, 0), point(1.5, 2)])
        result = await read_fault_episodes(
            reads, ts, start=at(0), end=at(2), as_of=at(10)
        )
        assert result.truncated
        assert result.episodes == []

    async def test_observation_time_excludes_future_points(self, reads, series_reader):
        result = await read_fault_episodes(
            reads,
            series_reader([point(0, 1), point(20, 0)]),
            start=at(0),
            end=at(5),
            as_of=at(10),
        )
        assert result.as_of == at(10)
        assert result.episodes[0].ended_at is None
        assert not result.truncated

    async def test_stops_after_resolving_relevant_closure(
        self, reads, series_reader, monkeypatch
    ):
        monkeypatch.setattr("api.fault_episodes.PAGE_SIZE", 2)
        ts = series_reader([point(0, 1), point(2, 0), point(30, 1), point(31, 0)])
        result = await read_fault_episodes(
            reads, ts, start=at(0), end=at(1), as_of=at(40)
        )
        assert len(result.episodes) == 1
        assert not result.truncated
        assert ts.fetch_points.await_count == 1

    async def test_labels_loaded_once_per_driver_and_no_label_falls_back(
        self, reads, series_reader
    ):
        reads.list_devices.return_value = [
            _device(CODE, WINDOW),
            _device(CODE).model_copy(update={"id": "other"}),
        ]
        result = await read_fault_episodes(
            reads, series_reader([point(0, 1)]), start=at(0), end=at(2), as_of=at(2)
        )
        reads.get_driver_labels.assert_called_once_with("thermostat")
        assert {e.attribute_name for e in result.episodes} == {
            "fault_code",
            "window_open",
        }
        assert (
            next(e for e in result.episodes if e.attribute_name == "window_open").label
            is None
        )


@pytest.mark.asyncio
async def test_one_budget_is_shared_by_both_read_directions(
    reads, series_reader, monkeypatch
):
    monkeypatch.setattr("api.fault_episodes.POINT_BUDGET", 4)
    ts = series_reader(
        [point(-10, 0), point(-2, 1), point(-1, 2), point(1, 0), point(1.5, 3)]
    )
    result = await read_fault_episodes(reads, ts, start=at(0), end=at(2), as_of=at(10))
    assert result.truncated
    assert result.episodes == []
    assert ts.fetch_points.call_args.kwargs["limit"] == 1
