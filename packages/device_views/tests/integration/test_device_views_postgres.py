import os

import pytest

from device_views import DeviceViewInput, DeviceViewsService
from models.errors import NotFoundError
from models.targets import DevicesFilter

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")
pytestmark = [
    pytest.mark.integration,
    pytest.mark.asyncio,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


async def test_views_survive_restart_and_do_not_depend_on_any_devices():
    assert POSTGRES_URL is not None
    first = DeviceViewsService(POSTGRES_URL)
    await first.start()
    created = await first.create(
        DeviceViewInput(
            name="Empty building",
            filter=DevicesFilter(tags={"étage": ["2", "3"]}, driver_id="not-installed"),
            group_by=["étage", "pièce"],
        )
    )
    await first.stop()
    second = DeviceViewsService(POSTGRES_URL)
    await second.start()
    try:
        assert await second.get(created.id) == created
        assert created in await second.list()
        updated = await second.update(
            created.id, DeviceViewInput(name="Renamed", group_by=["ecs"])
        )
        assert updated.created_at == created.created_at
        assert (await second.get(created.id)).group_by == ["ecs"]
        await second.delete(created.id)
        # A concurrent deletion must not be silently undone by an in-flight update.
        with pytest.raises(NotFoundError):
            await second.storage.update(updated)
        with pytest.raises(NotFoundError):
            await second.get(created.id)
        with pytest.raises(NotFoundError):
            await second.delete(created.id)
    finally:
        await second.stop()
