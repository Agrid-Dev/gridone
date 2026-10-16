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
    from models.types import AttributeValueType, Severity
    from timeseries import TimeSeriesService
    from timeseries.domain import DataPoint

#: Episodes closer than this count as one: a fault that bounces counts once.
MERGE_GAP = timedelta(minutes=1)
#: Series read at the same time, as for the service's own fan-outs.
FANOUT_LIMIT = 4
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
    previous: DataPoint | None,
    is_faulty: Callable[[AttributeValueType | None], bool],
    merge_gap: timedelta = MERGE_GAP,
) -> list[Episode]:
    """The episodes along ``points`` (ascending), oldest first.

    ``previous`` is the last point before them: an episode already open when
    they start keeps its true onset. Successive faulty points, such as a
    changing fault code or one value written again after unknown readings,
    extend a single episode. An episode still open at the last point is
    ongoing. Episodes less than ``merge_gap`` apart merge.
    """
    episodes: list[Episode] = []
    opening: DataPoint | None = None
    for current in [*([previous] if previous else []), *points]:
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


async def read_fault_episodes(
    reads: ScopedDeviceReads,
    ts: TimeSeriesService,
    *,
    start: datetime,
    end: datetime,
    severity: Severity | None = None,
) -> FaultEpisodesResponse:
    """The episodes of the readable fault attributes that share time with
    [start, end], most recent first.

    Each series is read from its last point before ``start`` up to now, not
    only up to ``end``: an episode still running at ``end`` keeps its real
    close, or stays ongoing.
    """
    devices = reads.list_devices(attribute_selection=FAULT_SELECTION)
    semaphore = asyncio.Semaphore(FANOUT_LIMIT)

    async def read(series: FaultSeries) -> tuple[list[FaultEpisodeResponse], bool]:
        async with semaphore:
            previous = await ts.fetch_point_before(series.key, before=start)
            fetched = await ts.fetch_points(series.key, start=start)
        episodes = reconstruct_episodes(
            fetched.points,
            previous=previous,
            is_faulty=series.attribute.is_faulty_value,
        )
        kept = [
            _to_response(series, episode)
            for episode in episodes
            if overlaps(episode, start=start, end=end)
        ]
        return kept, fetched.truncated

    results = await asyncio.gather(
        *(read(series) for series in fault_series(devices, severity))
    )
    episodes = [episode for kept, _ in results for episode in kept]
    episodes.sort(key=lambda episode: episode.started_at, reverse=True)
    return FaultEpisodesResponse(
        episodes=episodes,
        start=start,
        end=end,
        truncated=any(truncated for _, truncated in results),
    )


def _to_response(series: FaultSeries, episode: Episode) -> FaultEpisodeResponse:
    attribute = series.attribute
    return FaultEpisodeResponse(
        device_id=series.device_id,
        device_name=series.device_name,
        device_type=series.device_type,
        attribute_name=attribute.name,
        data_type=attribute.data_type,
        severity=attribute.severity,
        label=attribute.label,
        value=episode.value,
        started_at=episode.started_at,
        ended_at=episode.ended_at,
    )
