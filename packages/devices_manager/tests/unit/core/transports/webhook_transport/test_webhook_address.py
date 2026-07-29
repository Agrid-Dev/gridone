import pytest

from devices_manager.core.transports.transport_address import PushTransportAddress
from devices_manager.core.transports.webhook_transport import WebhookAddress


class TestWebhookAddressHierarchy:
    def test_is_push_transport_address(self) -> None:
        address = WebhookAddress(topic="room1/snapshot")
        assert isinstance(address, PushTransportAddress)


class TestWebhookAddressFromRaw:
    def test_from_str(self) -> None:
        address = WebhookAddress.from_raw("room1/snapshot")
        assert address.topic == "room1/snapshot"

    def test_from_dict(self) -> None:
        address = WebhookAddress.from_raw({"topic": "room1/snapshot"})
        assert address.topic == "room1/snapshot"

    def test_invalid_type_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid raw address type"):
            WebhookAddress.from_raw(42)  # type: ignore[arg-type]


class TestWebhookAddressId:
    def test_id_is_stable(self) -> None:
        ids = {WebhookAddress(topic="room1/snapshot").id for _ in range(10)}
        assert len(ids) == 1

    def test_id_differs_for_different_topics(self) -> None:
        a = WebhookAddress(topic="room1/snapshot")
        b = WebhookAddress(topic="room2/snapshot")
        assert a.id != b.id
