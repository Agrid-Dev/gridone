from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

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


@router.get("/export/csv")
async def export_csv(
    series_ids: list[str] = Query(...),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    last: str | None = Query(None),
    carry_forward: bool = Query(False),
    ts=Depends(get_ts_service),
) -> Response:
    csv_content = await ts.export_csv(
        series_ids, start=start, end=end, last=last, carry_forward=carry_forward
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="export.csv"'},
    )


@router.get("/{series_id}/points")
async def get_points(
    series_id: str,
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    last: str | None = Query(None),
    carry_forward: bool = Query(False),
    ts=Depends(get_ts_service),
) -> list[DataPointResponse]:
    series = await ts.get_series(series_id)
    points = await ts.fetch_points(
        series.key, start=start, end=end, last=last, carry_forward=carry_forward
    )
    return [DataPointResponse(timestamp=p.timestamp, value=p.value) for p in points]
