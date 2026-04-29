import pytest

from models.service import Service

pytestmark = pytest.mark.asyncio


class _FakeService:
    def __init__(self, storage_url: str | None) -> None:
        self.storage_url = storage_url
        self.started = False
        self.stopped = False

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.stopped = True


class _NotAService:
    async def start(self) -> None: ...


async def test_conforming_class_satisfies_protocol() -> None:
    assert isinstance(_FakeService(None), Service)


async def test_class_missing_methods_does_not_satisfy_protocol() -> None:
    assert not isinstance(_NotAService(), Service)


async def test_protocol_lifecycle_roundtrip() -> None:
    svc: Service = _FakeService("postgresql://example")
    await svc.start()
    await svc.stop()
    assert isinstance(svc, _FakeService)
    assert svc.started
    assert svc.stopped
