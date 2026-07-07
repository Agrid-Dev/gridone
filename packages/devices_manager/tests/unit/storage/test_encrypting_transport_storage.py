import pytest

from devices_manager.core.transports.mqtt_transport import MqttTransportConfig
from devices_manager.core.transports.secret_cipher import SecretCipher
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.dto.transport_dto import MqttTransport, Transport
from devices_manager.storage.encrypting_transport_storage import (
    EncryptingTransportStorage,
)
from devices_manager.storage.memory import MemoryStorageBackend
from devices_manager.types import TransportProtocols

pytestmark = pytest.mark.asyncio


def _mqtt_transport(transport_id: str = "t1", **config_kwargs: object) -> MqttTransport:
    return MqttTransport(
        id=transport_id,
        name="site-mqtt",
        protocol=TransportProtocols.MQTT,
        config=MqttTransportConfig(host="broker", **config_kwargs),  # type: ignore[arg-type]
        connection_state=TransportConnectionState.idle(),
    )


def _as_mqtt(transport: Transport) -> MqttTransport:
    assert isinstance(transport, MqttTransport)
    return transport


@pytest.fixture
def cipher() -> SecretCipher:
    return SecretCipher(SecretCipher.generate_key())


@pytest.fixture
def backend() -> MemoryStorageBackend:
    return MemoryStorageBackend()


@pytest.fixture
def storage(
    backend: MemoryStorageBackend, cipher: SecretCipher
) -> EncryptingTransportStorage:
    return EncryptingTransportStorage(backend, cipher)


class TestEncryptingTransportStorage:
    async def test_write_then_read_round_trips_plaintext(
        self, storage: EncryptingTransportStorage
    ) -> None:
        transport = _mqtt_transport(client_key="my-private-key", password="hunter2")
        await storage.write(transport.id, transport)
        read_back = _as_mqtt(await storage.read(transport.id))
        assert read_back.config.client_key == "my-private-key"
        assert read_back.config.password == "hunter2"  # noqa: S105

    async def test_underlying_backend_never_sees_plaintext_secret(
        self, storage: EncryptingTransportStorage, backend: MemoryStorageBackend
    ) -> None:
        transport = _mqtt_transport(client_key="my-private-key", password="hunter2")
        await storage.write(transport.id, transport)
        raw = _as_mqtt(await backend.read(transport.id))
        assert raw.config.client_key != "my-private-key"
        assert raw.config.password != "hunter2"  # noqa: S105

    async def test_non_secret_fields_untouched(
        self, storage: EncryptingTransportStorage
    ) -> None:
        transport = _mqtt_transport(client_key="my-private-key")
        await storage.write(transport.id, transport)
        read_back = _as_mqtt(await storage.read(transport.id))
        assert read_back.config.host == "broker"

    async def test_read_all_decrypts_every_entry(
        self, storage: EncryptingTransportStorage
    ) -> None:
        await storage.write("t1", _mqtt_transport("t1", client_key="key-one"))
        await storage.write("t2", _mqtt_transport("t2", client_key="key-two"))
        all_transports = {t.id: _as_mqtt(t) for t in await storage.read_all()}
        assert all_transports["t1"].config.client_key == "key-one"
        assert all_transports["t2"].config.client_key == "key-two"

    async def test_no_secret_fields_set_is_a_no_op(
        self, storage: EncryptingTransportStorage, backend: MemoryStorageBackend
    ) -> None:
        transport = _mqtt_transport()
        await storage.write(transport.id, transport)
        raw = _as_mqtt(await backend.read(transport.id))
        assert raw.config.client_key is None
        assert raw.config.password is None

    async def test_list_all_and_delete_delegate_to_backend(
        self, storage: EncryptingTransportStorage
    ) -> None:
        transport = _mqtt_transport(client_key="key")
        await storage.write(transport.id, transport)
        assert await storage.list_all() == ["t1"]
        await storage.delete(transport.id)
        assert await storage.list_all() == []
