from datetime import UTC, datetime

import pytest

from device_views.models import DeviceView
from device_views.storage.memory import MemoryViewStorage
from models.errors import NotFoundError
from models.targets import DevicesFilter

pytestmark = pytest.mark.asyncio


async def test_round_trip_and_detached_copies():
    storage = MemoryViewStorage()
    now = datetime.now(UTC)
    view = DeviceView(
        id="v",
        name="Building",
        filter=DevicesFilter(tags={"floor": ["2", "3"]}),
        group_by=["floor", "room"],
        created_at=now,
        updated_at=now,
    )
    await storage.create(view)
    view.group_by.append("ecs")
    saved = await storage.get("v")
    assert saved.group_by == ["floor", "room"]
    assert saved.filter.tags is not None
    saved.filter.tags["floor"].clear()
    listed = await storage.list()
    assert listed[0].filter.tags == {"floor": ["2", "3"]}
    listed[0].name = "Edited"
    await storage.update(listed[0])
    assert (await storage.get("v")).name == "Edited"
    await storage.delete("v")
    assert await storage.list() == []
    await storage.close()
    for operation in [storage.get("v"), storage.delete("v"), storage.update(view)]:
        with pytest.raises(NotFoundError):
            await operation
