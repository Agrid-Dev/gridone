from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest

from devices_manager.core.discovery_manager import (
    DevicesDiscoveryManager,
    DiscoveryConfig,
    DiscoveryContext,
    DiscoveryStorage,
)
from devices_manager.storage.memory import MemoryDevicesStorage

if TYPE_CHECKING:
    from devices_manager.core.device import CoreDevice
    from devices_manager.core.driver import Driver
    from devices_manager.core.transports import TransportClient


class FnCallSpy:
    call_args: list[CoreDevice]

    def __init__(self) -> None:
        self.call_args = []

    async def call(self, device: CoreDevice):
        self.call_args.append(device)

    @property
    def call_count(self) -> int:
        return len(self.call_args)


@pytest.fixture
def add_device_spy() -> FnCallSpy:
    return FnCallSpy()


DEVICE_EXISTS_CONFIG = {"id": "abc", "gateway_id": "gtw"}


@pytest.fixture
def discovery_context(
    driver_w_push_transport,
    driver,
    mock_push_transport_client,
    mock_transport_client,
    add_device_spy,
) -> DiscoveryContext:
    def get_driver(driver_id: str) -> Driver:
        drivers = {d.id: d for d in (driver_w_push_transport, driver)}
        return drivers[driver_id]

    def get_transport(transport_id: str) -> TransportClient:
        transports = {
            t.id: t for t in (mock_push_transport_client, mock_transport_client)
        }
        return transports[transport_id]

    def device_exists(device: CoreDevice) -> bool:
        return device.config == DEVICE_EXISTS_CONFIG

    return DiscoveryContext(
        get_driver=get_driver,
        get_transport=get_transport,
        device_exists=device_exists,
        add_device=add_device_spy.call,
    )


@pytest.mark.asyncio
async def test_unregister_unexisting_discovery(discovery_context):
    ddm = DevicesDiscoveryManager(discovery_context, MemoryDevicesStorage().discoveries)
    with pytest.raises(KeyError):
        await ddm.unregister("driver_id", "transport_id")


@pytest.mark.asyncio
async def test_register_fails_driver_not_found(
    discovery_context, mock_push_transport_client
):
    ddm = DevicesDiscoveryManager(discovery_context, MemoryDevicesStorage().discoveries)
    with pytest.raises(KeyError):
        await ddm.register("unknown_driver", mock_push_transport_client.id)


@pytest.mark.asyncio
async def test_register_fails_transport_not_found(
    discovery_context, driver_w_push_transport
):
    ddm = DevicesDiscoveryManager(discovery_context, MemoryDevicesStorage().discoveries)
    with pytest.raises(KeyError):
        await ddm.register(driver_w_push_transport.id, "unknown transport")


@pytest.mark.asyncio
async def test_register_fails_discovery_exists(
    discovery_context, driver_w_push_transport, mock_push_transport_client
):
    ddm = DevicesDiscoveryManager(discovery_context, MemoryDevicesStorage().discoveries)
    await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)
    with pytest.raises(ValueError):  # noqa: PT011
        await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)


@pytest.mark.asyncio
async def test_callback_not_fired_after_unregister(
    discovery_context,
    driver_w_push_transport,
    mock_push_transport_client,
    add_device_spy,
):
    ddm = DevicesDiscoveryManager(discovery_context, MemoryDevicesStorage().discoveries)
    await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)
    await ddm.unregister(
        driver_w_push_transport.metadata.id, mock_push_transport_client.id
    )
    await mock_push_transport_client.simulate_event(
        "/xx",
        {"id": "abc", "gateway_id": "gtw", "payload": {"temperature": 22}},
    )
    assert add_device_spy.call_count == 0


@pytest.mark.asyncio
async def tests_list(
    discovery_context,
    driver_w_push_transport,
    mock_push_transport_client,
):
    ddm = DevicesDiscoveryManager(discovery_context, MemoryDevicesStorage().discoveries)
    await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)
    configs = ddm.list()
    assert len(configs) == 1
    config = configs[0]
    assert config["driver_id"] == driver_w_push_transport.id
    assert config["transport_id"] == mock_push_transport_client.id


@pytest.mark.asyncio
async def tests_list_with_filter(
    discovery_context,
    driver_w_push_transport,
    mock_push_transport_client,
):
    ddm = DevicesDiscoveryManager(discovery_context, MemoryDevicesStorage().discoveries)

    await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)
    configs = ddm.list(driver_id=driver_w_push_transport.id)
    assert len(configs) == 1
    config = configs[0]
    assert config["driver_id"] == driver_w_push_transport.id
    assert config["transport_id"] == mock_push_transport_client.id

    other_d = ddm.list(driver_id="other")
    assert len(other_d) == 0
    other_t = ddm.list(transport_id="other")
    assert len(other_t) == 0


@pytest.mark.asyncio
async def tests_has(
    discovery_context,
    driver_w_push_transport,
    mock_push_transport_client,
):
    ddm = DevicesDiscoveryManager(discovery_context, MemoryDevicesStorage().discoveries)

    await ddm.register(driver_w_push_transport.id, mock_push_transport_client.id)
    assert ddm.has(driver_w_push_transport.id, mock_push_transport_client.id)
    assert not ddm.has("unknown", mock_push_transport_client.id)
    assert not ddm.has(driver_w_push_transport.id, "unknown")
    assert not ddm.has("unknown", "unknown")


@pytest.fixture
def discovery_storage() -> DiscoveryStorage:
    return MemoryDevicesStorage().discoveries


@pytest.fixture
def config(driver_w_push_transport, mock_push_transport_client) -> DiscoveryConfig:
    return {
        "driver_id": driver_w_push_transport.id,
        "transport_id": mock_push_transport_client.id,
    }


_EVENT = {"id": "new", "gateway_id": "gtw", "payload": {"temperature": 22}}


@pytest.mark.asyncio
async def test_register_persists_discovery(
    discovery_context, discovery_storage, config
):
    ddm = DevicesDiscoveryManager(discovery_context, discovery_storage)
    await ddm.register(config["driver_id"], config["transport_id"])
    assert await discovery_storage.read_all() == [config]


@pytest.mark.asyncio
async def test_unregister_deletes_persisted_discovery(
    discovery_context, discovery_storage, config
):
    ddm = DevicesDiscoveryManager(discovery_context, discovery_storage)
    await ddm.register(config["driver_id"], config["transport_id"])
    await ddm.unregister(config["driver_id"], config["transport_id"])
    assert await discovery_storage.read_all() == []


@pytest.mark.asyncio
async def test_failed_register_persists_nothing(
    discovery_context, discovery_storage, mock_push_transport_client
):
    ddm = DevicesDiscoveryManager(discovery_context, discovery_storage)
    with pytest.raises(KeyError, match="unknown_driver"):
        await ddm.register("unknown_driver", mock_push_transport_client.id)
    assert await discovery_storage.read_all() == []


@pytest.mark.asyncio
async def test_register_stops_listening_when_persisting_fails(
    discovery_context, config, mock_push_transport_client, add_device_spy
):
    storage = AsyncMock(spec=DiscoveryStorage)
    storage.write.side_effect = OSError("disk full")
    ddm = DevicesDiscoveryManager(discovery_context, storage)
    with pytest.raises(OSError, match="disk full"):
        await ddm.register(config["driver_id"], config["transport_id"])
    assert not ddm.has(config["driver_id"], config["transport_id"])
    await mock_push_transport_client.simulate_event("/xx", _EVENT)
    await asyncio.sleep(0.05)
    assert add_device_spy.call_count == 0


@pytest.mark.asyncio
async def test_restore_skips_unrestorable_and_starts_the_rest(
    discovery_context,
    discovery_storage,
    config,
    mock_push_transport_client,
    add_device_spy,
):
    """A stored discovery that can't start is logged and skipped, never
    blocks the others, and stays stored and registered."""
    push_driver = config["driver_id"]
    push_transport = config["transport_id"]
    broken: list[DiscoveryConfig] = [
        {"driver_id": "deleted_driver", "transport_id": push_transport},
        {"driver_id": push_driver, "transport_id": "deleted_transport"},
        # No discovery block on this driver.
        {"driver_id": "test_driver", "transport_id": push_transport},
        # Not a push transport.
        {"driver_id": push_driver, "transport_id": "my-transport"},
    ]
    for stored in [*broken, config]:
        await discovery_storage.write(stored)
    ddm = DevicesDiscoveryManager(discovery_context, discovery_storage)

    await ddm.restore()

    assert all(ddm.has(c["driver_id"], c["transport_id"]) for c in [*broken, config])
    assert sorted(ddm.list(), key=str) == sorted([*broken, config], key=str)
    assert await discovery_storage.read_all() == [*broken, config]
    await mock_push_transport_client.simulate_event("/xx", _EVENT)
    await asyncio.sleep(0.05)
    assert add_device_spy.call_count == 1


@pytest.mark.asyncio
async def test_discovery_that_failed_to_restore_can_be_unregistered(
    discovery_context, discovery_storage, mock_push_transport_client
):
    stored: DiscoveryConfig = {
        "driver_id": "deleted_driver",
        "transport_id": mock_push_transport_client.id,
    }
    await discovery_storage.write(stored)
    ddm = DevicesDiscoveryManager(discovery_context, discovery_storage)
    await ddm.restore()

    await ddm.unregister(stored["driver_id"], stored["transport_id"])

    assert ddm.list() == []
    assert await discovery_storage.read_all() == []


@pytest.mark.asyncio
async def test_restore_twice_keeps_a_single_listener(
    discovery_context,
    discovery_storage,
    config,
    mock_push_transport_client,
    add_device_spy,
):
    await discovery_storage.write(config)
    ddm = DevicesDiscoveryManager(discovery_context, discovery_storage)

    await ddm.restore()
    await ddm.restore()

    await mock_push_transport_client.simulate_event("/xx", _EVENT)
    await asyncio.sleep(0.05)
    assert add_device_spy.call_count == 1


@pytest.mark.asyncio
async def test_register_again_retries_an_idle_discovery(
    discovery_context,
    discovery_storage,
    config,
    mock_push_transport_client,
    add_device_spy,
):
    """Broker down at boot: restore leaves the pair idle, registering it again
    once the broker answers starts it."""
    await discovery_storage.write(config)
    register_listener = mock_push_transport_client.register_listener

    async def _broker_down(*_: object) -> str:
        msg = "Accessing mqtt client when undefined"
        raise ValueError(msg)

    mock_push_transport_client.register_listener = _broker_down
    ddm = DevicesDiscoveryManager(discovery_context, discovery_storage)
    await ddm.restore()
    mock_push_transport_client.register_listener = register_listener

    await ddm.register(config["driver_id"], config["transport_id"])

    await mock_push_transport_client.simulate_event("/xx", _EVENT)
    await asyncio.sleep(0.05)
    assert add_device_spy.call_count == 1
