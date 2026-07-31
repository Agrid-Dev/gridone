import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio

from timeseries.service import TimeSeriesService


@pytest_asyncio.fixture(
    params=[
        pytest.param("memory", id="memory"),
        pytest.param(
            "timescale",
            id="timescale",
            marks=[
                pytest.mark.integration,
                pytest.mark.skipif(
                    os.environ.get("POSTGRES_TEST_URL") is None,
                    reason="POSTGRES_TEST_URL not set",
                ),
            ],
        ),
    ]
)
async def ts_service(
    request: pytest.FixtureRequest,
) -> AsyncIterator[TimeSeriesService]:
    import asyncpg  # noqa: PLC0415

    url = None if request.param == "memory" else os.environ["POSTGRES_TEST_URL"]
    service = TimeSeriesService(url)
    await service.start()
    if url is not None:
        conn = await asyncpg.connect(url)
        try:
            await conn.execute("TRUNCATE ts_data_points, ts_series;")
        finally:
            await conn.close()
    yield service
    await service.stop()
