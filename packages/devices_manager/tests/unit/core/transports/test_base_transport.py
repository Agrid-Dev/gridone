import asyncio

import pytest
from pydantic import ValidationError

from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.base import TransportClient
from devices_manager.core.transports.base_transport_config import BaseTransportConfig
from devices_manager.core.transports.mqtt_transport import (
    MqttTransportClient,
    MqttTransportConfig,
)


def _mqtt_client() -> MqttTransportClient:
    return MqttTransportClient(
        TransportMetadata(id="mqtt-1", name="mqtt"),
        MqttTransportConfig(host="broker", port=1883),
    )


class _RecordingTransportClient(TransportClient):
    """Minimal concrete transport that records read concurrency."""

    _serialize_reads = False

    def __init__(
        self,
        *,
        read_delay: float = 0.02,
        shared_state: dict[str, int] | None = None,
    ) -> None:
        super().__init__(
            TransportMetadata(id="test", name="test"), BaseTransportConfig()
        )
        self._read_delay = read_delay
        self._shared_state = (
            shared_state
            if shared_state is not None
            else {"in_flight": 0, "max_concurrent": 0}
        )

    @property
    def max_concurrent_reads(self) -> int:
        return self._shared_state["max_concurrent"]

    async def connect(self) -> None:
        pass

    async def close(self) -> None:
        pass

    async def write(self, address: str, value: object) -> None:
        pass

    async def _read(self, address: str) -> str:
        self._shared_state["in_flight"] += 1
        self._shared_state["max_concurrent"] = max(
            self._shared_state["max_concurrent"], self._shared_state["in_flight"]
        )
        await asyncio.sleep(self._read_delay)
        self._shared_state["in_flight"] -= 1
        return address


class _SerializedTransportClient(_RecordingTransportClient):
    _serialize_reads = True


class TestReadLock:
    @pytest.mark.asyncio
    async def test_default_reads_stay_concurrent(self) -> None:
        client = _RecordingTransportClient()

        await asyncio.gather(client.read("a"), client.read("b"), client.read("c"))

        assert client.max_concurrent_reads > 1

    @pytest.mark.asyncio
    async def test_serialize_reads_never_overlap(self) -> None:
        client = _SerializedTransportClient()

        await asyncio.gather(client.read("a"), client.read("b"), client.read("c"))

        assert client.max_concurrent_reads == 1

    @pytest.mark.asyncio
    async def test_distinct_instances_stay_concurrent_even_when_serialized(
        self,
    ) -> None:
        shared_state = {"in_flight": 0, "max_concurrent": 0}
        client_a = _SerializedTransportClient(shared_state=shared_state)
        client_b = _SerializedTransportClient(shared_state=shared_state)

        await asyncio.gather(client_a.read("a"), client_b.read("b"))

        assert shared_state["max_concurrent"] == 2


class TestUpdateConfig:
    def test_partial_patch_merges_and_preserves_untouched_fields(self) -> None:
        # Regression (AGR-901): a partial config patch (only `ca_cert`) must
        # merge onto the existing config, not be validated as a standalone
        # config — the required `host` is preserved rather than reported missing.
        client = _mqtt_client()

        client.update_config({"ca_cert": "cert"}, reconnect=False)

        assert client.config.ca_cert == "cert"
        assert client.config.host == "broker"
        assert client.config.port == 1883

    def test_partial_patch_is_validated_against_the_config_class(self) -> None:
        client = _mqtt_client()

        with pytest.raises(ValidationError):
            client.update_config({"port": "not-a-number"}, reconnect=False)

    def test_unknown_field_is_rejected(self) -> None:
        client = _mqtt_client()

        with pytest.raises(ValidationError):
            client.update_config({"nonsense": True}, reconnect=False)
