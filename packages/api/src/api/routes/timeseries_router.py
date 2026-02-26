from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from users import AuthorizationService, Permission
from api.dependencies import (
    get_authorization_service,
    get_current_user_id,
    get_ts_service,
)
from api.schemas.timeseries import DataPointResponse, TimeSeriesResponse

router = APIRouter()


@router.get("/")
async def list_series(
    user_id: Annotated[str, Depends(get_current_user_id)],
    authz: Annotated[AuthorizationService, Depends(get_authorization_service)],
    owner_id: str | None = Query(None),
    metric: str | None = Query(None),
    ts=Depends(get_ts_service),
) -> list[TimeSeriesResponse]:
    has_perm = await authz.check_permission(user_id, Permission.TIMESERIES_READ)
    if not has_perm:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: timeseries:read",
        )
    results = await ts.list_series(owner_id=owner_id, metric=metric)
    # Filter by device access (owner_id is a device ID)
    all_owner_ids = list({s.key.owner_id for s in results})
    accessible = await authz.filter_device_ids(
        user_id, Permission.TIMESERIES_READ, all_owner_ids
    )
    accessible_set = set(accessible)
    return [
        TimeSeriesResponse(**s.__dict__)
        for s in results
        if s.key.owner_id in accessible_set
    ]


@router.get("/{series_id}/points")
async def get_points(
    series_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
    authz: Annotated[AuthorizationService, Depends(get_authorization_service)],
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    ts=Depends(get_ts_service),
) -> list[DataPointResponse]:
    has_perm = await authz.check_permission(user_id, Permission.TIMESERIES_READ)
    if not has_perm:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: timeseries:read",
        )
    series = await ts.get_series(series_id)
    if series is None:
        msg = f"Series {series_id} not found"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
    # Check device-level access
    has_device_perm = await authz.check_device_permission(
        user_id, Permission.TIMESERIES_READ, series.key.owner_id
    )
    if not has_device_perm:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: timeseries:read",
        )
    points = await ts.fetch_points(series.key, start=start, end=end)
    return [DataPointResponse(timestamp=p.timestamp, value=p.value) for p in points]
