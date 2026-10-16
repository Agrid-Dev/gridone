from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, cast

from fastapi import APIRouter, Depends, Query

from api.access import ScopedDeviceReads
from api.access.dependencies import get_device_reads
from api.auth import require_permission
from api.dependencies import get_ts_service
from api.fault_episodes import read_fault_episodes
from api.schemas.fault_episodes import FaultEpisodesResponse
from devices_manager.dto import FaultView
from models.errors import InvalidError
from models.types import Severity
from timeseries import TimeSeriesService
from timeseries.domain import normalize_to_utc, resolve_last
from users.permissions import Permission

router = APIRouter()

#: The alert history a caller gets when it asks for no period.
DEFAULT_EPISODES_PERIOD = timedelta(days=7)


@router.get("/", dependencies=[Depends(require_permission(Permission.DEVICES_READ))])
def list_faults(
    reads: Annotated[ScopedDeviceReads, Depends(get_device_reads)],
    severity: Severity | None = Query(None),
    device_id: str | None = Query(None),
) -> list[FaultView]:
    return reads.list_faults(severity=severity, device_id=device_id)


@router.get(
    "/episodes",
    dependencies=[
        Depends(require_permission(Permission.DEVICES_READ)),
        Depends(require_permission(Permission.TIMESERIES_READ)),
    ],
)
async def list_fault_episodes(
    reads: Annotated[ScopedDeviceReads, Depends(get_device_reads)],
    ts: Annotated[TimeSeriesService, Depends(get_ts_service)],
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    last: str | None = Query(None),
    severity: Severity | None = Query(None),
) -> FaultEpisodesResponse:
    """Alert episodes, finished or ongoing, that share time with the period.

    Rebuilt from the history of the fault attributes; the last 7 days unless a
    period is given.
    """
    resolved_start, resolved_end = _resolve_period(
        start, end, last, timezone=ts.default_timezone
    )
    return await read_fault_episodes(
        reads, ts, start=resolved_start, end=resolved_end, severity=severity
    )


def _resolve_period(
    start: datetime | None,
    end: datetime | None,
    last: str | None,
    *,
    timezone: str,
) -> tuple[datetime, datetime]:
    """The period read as the series routes read theirs: ``start`` and ``end``,
    or ``last`` for a duration up to now, and a datetime without an offset in
    the building's timezone."""
    now = datetime.now(UTC)
    resolved_end = normalize_to_utc(end, timezone) or now
    if start is not None:
        resolved_start = cast("datetime", normalize_to_utc(start, timezone))
    elif last is not None:
        resolved_start = resolve_last(last, now=now)
    else:
        resolved_start = resolved_end - DEFAULT_EPISODES_PERIOD
    if resolved_start >= resolved_end:
        msg = "start must be before end"
        raise InvalidError(msg)
    return resolved_start, resolved_end
