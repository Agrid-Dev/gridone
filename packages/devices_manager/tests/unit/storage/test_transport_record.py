"""The record is storage's private durable projection of a transport client:
identity + config only, connection state always hydrating back to idle."""

from datetime import UTC, datetime

import pytest

from devices_manager.core.transports import (
    TransportConnectionState,
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from devices_manager.core.transports.http_transport import HttpTransportConfig
from devices_manager.storage.transport_record import (
    TransportRecord,
    from_record,
    to_record,
)
from devices_manager.types import ConnectionStatus, TransportProtocols


@pytest.fixture
def client():
    metadata = TransportMetadata(
        id="t1",
        name="My Transport",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        updated_at=datetime(2026, 2, 1, tzinfo=UTC),
    )
    config = make_transport_config(TransportProtocols.HTTP, {"request_timeout": 5})
    return make_transport_client(TransportProtocols.HTTP, config, metadata)


class TestRoundTrip:
    def test_preserves_identity_config_and_timestamps(self, client):
        result = from_record(to_record(client))
        assert result.id == client.id
        assert result.metadata.name == client.metadata.name
        assert result.protocol == client.protocol
        assert result.config == HttpTransportConfig(request_timeout=5)
        assert result.metadata.created_at == client.metadata.created_at
        assert result.metadata.updated_at == client.metadata.updated_at

    def test_connected_client_hydrates_idle(self, client):
        client.connection_state = TransportConnectionState.connected()
        result = from_record(to_record(client))
        assert result.connection_state.status == ConnectionStatus.IDLE


class TestLegacyPayloads:
    def test_missing_name_config_and_timestamps_use_defaults(self):
        record = TransportRecord.model_validate({"id": "t1", "protocol": "http"})
        assert record.name == ""
        assert record.config == {}
        assert record.created_at is not None
        assert record.updated_at is not None
