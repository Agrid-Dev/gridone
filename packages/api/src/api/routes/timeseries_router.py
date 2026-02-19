from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.dependencies import get_ts_service
from api.schemas.timeseries import DataPointResponse, TimeSeriesResponse

router = APIRouter()


@router.get("/")
async def list_series(
    owner_id: str | None = Query(None),
    metric: str | None = Query(None),
    ts=Depends(get_ts_service),
) -> list[TimeSeriesResponse]:
    results = await ts.list_series(owner_id=owner_id, metric=metric)
    return [TimeSeriesResponse(**s.__dict__) for s in results]


@router.get("/{series_id}/points")
async def get_points(
    series_id: str,
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    ts=Depends(get_ts_service),
) -> list[DataPointResponse]:
    series = await ts.get_series(series_id)
    if series is None:
        msg = f"Series {series_id} not found"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=msg)
    points = await ts.fetch_points(series.key, start=start, end=end)
    return [DataPointResponse(timestamp=p.timestamp, value=p.value) for p in points]
