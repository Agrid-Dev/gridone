from __future__ import annotations

import pytest
from models.errors import InvalidError
from timeseries import TimeSeriesService, create_service
from timeseries.storage import MemoryStorage, build_storage


class TestBuildStorage:
    def test_none_returns_memory(self):
        storage = build_storage(None)
        assert isinstance(storage, MemoryStorage)

    def test_default_returns_memory(self):
        storage = build_storage()
        assert isinstance(storage, MemoryStorage)

    def test_unsupported_url_raises(self):
        with pytest.raises(InvalidError, match="Unsupported storage URL scheme"):
            build_storage("unsupported://localhost")


@pytest.mark.asyncio
class TestCreateService:
    async def test_returns_service(self):
        service = await create_service()
        assert isinstance(service, TimeSeriesService)

    async def test_none_uses_memory(self):
        service = await create_service(None)
        assert isinstance(service, TimeSeriesService)
        assert isinstance(service._storage, MemoryStorage)
