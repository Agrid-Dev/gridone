import hashlib
from collections.abc import Callable
from typing import Any

from core.device import Device, DeviceBase
from core.driver import DiscoveryListener, Driver
from core.transports import PushTransportClient, TransportClient
from core.types import DeviceConfig


def _hash_config(device_config: DeviceConfig) -> str:
    return hashlib.sha256(str(device_config).encode("utf-8")).hexdigest()


type DiscoveryCallback = Callable[[Device], None]


class DiscoveryHandler:
    discovery_listener: DiscoveryListener
    driver: Driver
    transport: PushTransportClient
    on_discover: DiscoveryCallback
    _transport_listener_id: str | None

    def __init__(
        self,
        driver: Driver,
        transport: TransportClient,
        on_discover: DiscoveryCallback,
    ) -> None:
        if not isinstance(transport, PushTransportClient):
            msg = "Can only use Push Transport Clients for discovery"
            raise TypeError(msg)
        self.transport = transport
        discovery_listener = driver.discovery_listener
        if not discovery_listener:
            msg = f"Driver {driver.metadata.id} does not support discovery"
            raise TypeError(msg)
        self.driver = driver
        self.discovery_listener = discovery_listener
        self.on_discover = on_discover
        self._transport_listener_id = None

    async def start(self) -> None:
        seen: set[str] = set()

        def handle_payload(payload: Any) -> None:  # noqa: ANN401
            nonlocal seen
            device_config: DeviceConfig = self.discovery_listener.parse(payload)
            config_hash = _hash_config(device_config)
            if config_hash in seen:
                return
            device_base = DeviceBase(id=Device.gen_id(), name="", config=device_config)
            device = Device.from_base(
                device_base, transport=self.transport, driver=self.driver
            )
            self.on_discover(device)
            seen.add(config_hash)

        self._transport_listener_id = await self.transport.register_listener(
            self.discovery_listener.topic, handle_payload
        )

    async def stop(self) -> None:
        if not self._transport_listener_id:
            msg = "Miss a listener id to unregister"
            raise ValueError(msg)
        await self.transport.unregister_listener(
            self._transport_listener_id, self.discovery_listener.topic
        )


class DevicesDiscoveryManager:
    """Discovery manager handles registering listeners
    to Push transport clients to discover new devices.
    When discovering a new device, it fires a callback supplied
    by its client (devices manager).
    Only one discovery is supported per driver/transport pair."""

    _registry: dict[
        tuple[str, str], DiscoveryHandler
    ]  # keys: (driver_id, transport_id)

    def __init__(self) -> None:
        self._registry = {}

    def _build_key(self, driver_id: str, transport_id: str) -> tuple[str, str]:
        return (driver_id, transport_id)

    async def register_discovery(
        self,
        driver: Driver,
        transport: TransportClient,
        on_discover: DiscoveryCallback,
    ) -> None:
        """Registers a new DiscoveryHandler for the driver/transport pair.
        Only one discovery is supported per driver/transport pair."""
        job = DiscoveryHandler(driver, transport, on_discover)
        await job.start()
        key = self._build_key(driver.metadata.id, transport.id)
        self._registry[key] = job

    async def unregister_discovery(self, driver_id: str, transport_id: str) -> None:
        key = self._build_key(driver_id, transport_id)
        job = self._registry[(driver_id, transport_id)]
        await job.stop()
        del self._registry[key]
