"""Alert episodes, read back from the history of the fault attributes.

An episode is a period during which a fault attribute stayed outside its
healthy values: it opens when a recorded value turns faulty and closes when a
later one is healthy again. Nothing stores episodes. A fault attribute's
series only records its changes, so they are rebuilt from those points at
read time, judged with the attribute's own rule
(``FaultAttribute.is_faulty_value``) and today's definition of it.

The API layer joins the two services here: devices_manager knows the fault
attributes, timeseries their history.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, replace
from datetime import timedelta
from typing import TYPE_CHECKING

from api.schemas.fault_episodes import FaultEpisodeResponse, FaultEpisodesResponse
from devices_manager import FaultAttribute
from devices_manager.dto.device_dto import AttributeSelection
from devices_manager.types import AttributeKind
from timeseries.domain import SeriesKey

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Sequence
    from datetime import datetime

    from api.access import ScopedDeviceReads
    from devices_manager.dto.device_dto import Device
    from models.attribute_metadata import LocalizedText
    from models.types import AttributeValueType, Severity
    from timeseries import TimeSeriesService
    from timeseries.domain import DataPoint

#: Episodes closer than this count as one: a fault that bounces counts once.
MERGE_GAP = timedelta(minutes=1)
#: Series read at the same time, as for the service's own fan-outs.
FANOUT_LIMIT = 4
PAGE_SIZE = 10_000
POINT_BUDGET = 100_000
DEFAULT_EPISODES_PERIOD = timedelta(days=7)
#: Only the fault attributes are worth carrying out of the devices service.
FAULT_SELECTION = AttributeSelection(kinds=frozenset({AttributeKind.FAULT}))


@dataclass(frozen=True)
class Episode:
    started_at: datetime
    #: None while the episode is still ongoing.
    ended_at: datetime | None
    #: The value that opened it, such as a fault code.
    value: AttributeValueType


@dataclass(frozen=True)
class FaultSeries:
    """One fault attribute of one device, and the series that records it."""

    device_id: str
    device_name: str
    driver_id: str
    device_type: str | None
    attribute: FaultAttribute

    @property
    def key(self) -> SeriesKey:
        return SeriesKey(owner_id=self.device_id, metric=self.attribute.name)


def fault_series(
    devices: Iterable[Device], severity: Severity | None
) -> list[FaultSeries]:
    """The fault attributes of ``devices``, of ``severity`` when one is given."""
    return [
        FaultSeries(
            device_id=device.id,
            device_name=device.name,
            driver_id=device.driver_id,
            device_type=device.type,
            attribute=attribute,
        )
        for device in devices
        for attribute in device.attributes.values()
        if isinstance(attribute, FaultAttribute)
        and (severity is None or attribute.severity == severity)
    ]


def reconstruct_episodes(
    points: Sequence[DataPoint],
    *,
    is_faulty: Callable[[AttributeValueType | None], bool],
    merge_gap: timedelta = MERGE_GAP,
) -> list[Episode]:
    """The episodes along ``points`` (ascending), oldest first.

    The caller must supply enough preceding context to establish the onset;
    successive faulty points, such as a changing fault code or one value
    written again after unknown readings,
    extend a single episode. An episode still open at the last point is
    ongoing. Episodes less than ``merge_gap`` apart merge.
    """
    episodes: list[Episode] = []
    opening: DataPoint | None = None
    for current in points:
        if is_faulty(current.value):
            if opening is None:
                opening = current
        elif opening is not None:
            episodes.append(
                Episode(opening.timestamp, current.timestamp, opening.value)
            )
            opening = None
    if opening is not None:
        episodes.append(Episode(opening.timestamp, None, opening.value))
    return _merge_bounces(episodes, merge_gap)


def _merge_bounces(episodes: list[Episode], gap: timedelta) -> list[Episode]:
    merged: list[Episode] = []
    for episode in episodes:
        last = merged[-1] if merged else None
        if (
            last is not None
            and last.ended_at is not None
            and episode.started_at - last.ended_at < gap
        ):
            merged[-1] = replace(last, ended_at=episode.ended_at)
        else:
            merged.append(episode)
    return merged


def overlaps(episode: Episode, *, start: datetime, end: datetime) -> bool:
    """Whether ``episode`` shares any time with the period [start, end]."""
    return episode.started_at <= end and (
        episode.ended_at is None or episode.ended_at >= start
    )


async def _read_preceding(
    ts: TimeSeriesService, series: FaultSeries, *, start: datetime
) -> tuple[list[DataPoint], int, bool]:
    """Read backward to a minute-long healthy interval or retained history's start."""
    is_faulty = series.attribute.is_faulty_value
    remaining = POINT_BUDGET
    before = start
    right_fault = start
    preceding: list[DataPoint] = []
    anchored = False
    while remaining and not anchored:
        page = await ts.fetch_points_before(
            series.key, before=before, limit=min(PAGE_SIZE, remaining)
        )
        remaining -= len(page.points)
        for point in page.points:
            preceding.append(point)
            if is_faulty(point.value):
                right_fault = point.timestamp
            elif right_fault - point.timestamp >= MERGE_GAP:
                anchored = True
                break
        if not page.truncated:
            anchored = True
        if page.next_before is not None:
            before = page.next_before
    return list(reversed(preceding)), remaining, anchored


async def _read_series(
    ts: TimeSeriesService,
    series: FaultSeries,
    *,
    start: datetime,
    end: datetime,
    as_of: datetime,
) -> tuple[list[Episode], bool]:
    """Find a trustworthy onset, then read through closure and bounce context.

    Backward reading stops at a full minute of healthy history, or the first
    retained point. A healthy sample alone is insufficient: it could be a
    bounce inside an older episode. Forward cursors certify the absence of
    other points before them. Only exhaustion through ``as_of`` certifies an
    ongoing episode; an unread tail never does.
    """
    points, remaining, anchored = await _read_preceding(ts, series, start=start)
    if not anchored:
        return [], True
    is_faulty = series.attribute.is_faulty_value
    cursor = start
    verified: list[Episode] = []
    while remaining:
        page = await ts.fetch_points(
            series.key, start=cursor, end=as_of, limit=min(PAGE_SIZE, remaining)
        )
        remaining -= len(page.points)
        points.extend(page.points)
        relevant = [
            episode
            for episode in reconstruct_episodes(points, is_faulty=is_faulty)
            if overlaps(episode, start=start, end=end)
        ]
        if not page.truncated:
            return relevant, False
        assert page.next_start is not None  # noqa: S101
        cursor = page.next_start
        verified = [
            episode
            for episode in relevant
            if episode.ended_at is not None and episode.ended_at + MERGE_GAP <= cursor
        ]
        if cursor > end and len(verified) == len(relevant):
            return verified, False
    return verified, True


async def read_fault_episodes(
    reads: ScopedDeviceReads,
    ts: TimeSeriesService,
    *,
    start: datetime,
    end: datetime,
    as_of: datetime,
    severity: Severity | None = None,
) -> FaultEpisodesResponse:
    """Reconstruct readable history at one observation time, with bounded IO."""
    devices = reads.list_devices(attribute_selection=FAULT_SELECTION)
    series_list = fault_series(devices, severity)
    labels = {
        driver_id: reads.get_driver_labels(driver_id)
        for driver_id in {series.driver_id for series in series_list}
    }
    semaphore = asyncio.Semaphore(FANOUT_LIMIT)

    async def read(series: FaultSeries) -> tuple[list[FaultEpisodeResponse], bool]:
        async with semaphore:
            episodes, truncated = await _read_series(
                ts, series, start=start, end=end, as_of=as_of
            )
        attribute_labels = labels[series.driver_id].attributes.get(
            series.attribute.name
        )
        label = attribute_labels.label if attribute_labels else None
        return [_to_response(series, episode, label) for episode in episodes], truncated

    results = await asyncio.gather(*(read(series) for series in series_list))
    episodes = [episode for kept, _ in results for episode in kept]
    episodes.sort(key=lambda episode: episode.started_at, reverse=True)
    return FaultEpisodesResponse(
        episodes=episodes,
        start=start,
        end=end,
        as_of=as_of,
        truncated=any(truncated for _, truncated in results),
    )


def _to_response(
    series: FaultSeries, episode: Episode, label: LocalizedText | None
) -> FaultEpisodeResponse:
    attribute = series.attribute
    return FaultEpisodeResponse(
        device_id=series.device_id,
        device_name=series.device_name,
        device_type=series.device_type,
        attribute_name=attribute.name,
        data_type=attribute.data_type,
        severity=attribute.severity,
        label=label,
        value=episode.value,
        started_at=episode.started_at,
        ended_at=episode.ended_at,
    )
