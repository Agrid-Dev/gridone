import pytest

from models.service import Service

pytestmark = pytest.mark.asyncio


class _FakeService(Service):
    def __init__(self, storage_url: str | None) -> None:
        super().__init__(storage_url)
        self.started = False
        self.stopped = False

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.stopped = True


async def test_service_is_abstract() -> None:
    with pytest.raises(TypeError):
        Service(storage_url=None)


async def test_subclass_stores_storage_url() -> None:
    svc = _FakeService("postgresql://example")
    assert svc._storage_url == "postgresql://example"


async def test_subclass_accepts_none_storage_url() -> None:
    svc = _FakeService(None)
    assert svc._storage_url is None


async def test_subclass_lifecycle() -> None:
    svc = _FakeService(None)
    await svc.start()
    assert svc.started
    await svc.stop()
    assert svc.stopped
