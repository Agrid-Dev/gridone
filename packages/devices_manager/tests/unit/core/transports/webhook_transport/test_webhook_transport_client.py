import hashlib
import hmac

import pytest

from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.core.transports.webhook_transport import (
    WebhookAddress,
    WebhookTransportClient,
    WebhookTransportConfig,
)
from devices_manager.ingress import IngressRequest, MessageIngress
from models.errors import InvalidError, UnauthorizedError

TOPIC = "room1/snapshot"


def _make_client(**config_kwargs: str) -> WebhookTransportClient:
    config = WebhookTransportConfig.model_validate(config_kwargs or {"auth": "none"})
    metadata = TransportMetadata(id="my-webhook", name="My Webhook")
    return WebhookTransportClient(metadata, config)


def _request(
    topic: str = TOPIC,
    payload: bytes = b'{"temperature": 21.5}',
    headers: dict[str, str] | None = None,
) -> IngressRequest:
    return IngressRequest(topic=topic, payload=payload, headers=headers or {})


@pytest.fixture
def client() -> WebhookTransportClient:
    return _make_client(auth="none")


class TestMessageIngressPort:
    def test_client_implements_message_ingress(self, client) -> None:
        assert isinstance(client, MessageIngress)

    def test_ingress_request_is_framework_free(self) -> None:
        # Constructible from plain data — no HTTP server involved.
        request = _request(headers={"authorization": "Bearer x"})
        assert request.topic == TOPIC
        assert request.query == {}


@pytest.mark.asyncio
class TestIngressDispatch:
    async def test_dispatches_to_exact_topic_listeners(self, client) -> None:
        received: list[str] = []
        await client.register_listener(TOPIC, received.append)
        result = await client.ingress(_request())
        assert result.matched == 1
        assert received == ['{"temperature": 21.5}']

    async def test_unknown_topic_matches_zero(self, client) -> None:
        result = await client.ingress(_request(topic="unknown/topic"))
        assert result.matched == 0

    async def test_no_wildcard_matching(self, client) -> None:
        received: list[str] = []
        await client.register_listener(TOPIC, received.append)
        result = await client.ingress(_request(topic="room2/snapshot"))
        assert result.matched == 0
        assert received == []

    async def test_matched_counts_all_listeners(self, client) -> None:
        await client.register_listener(TOPIC, lambda _: None)
        await client.register_listener(TOPIC, lambda _: None)
        result = await client.ingress(_request())
        assert result.matched == 2

    async def test_failing_listener_does_not_break_dispatch(self, client) -> None:
        received: list[str] = []

        def failing(_: str) -> None:
            msg = "boom"
            raise RuntimeError(msg)

        await client.register_listener(TOPIC, failing)
        await client.register_listener(TOPIC, received.append)
        result = await client.ingress(_request())
        assert result.matched == 2
        assert received == ['{"temperature": 21.5}']

    async def test_unregistered_listener_not_dispatched(self, client) -> None:
        received: list[str] = []
        listener_id = await client.register_listener(TOPIC, received.append)
        await client.unregister_listener(listener_id, TOPIC)
        result = await client.ingress(_request())
        assert result.matched == 0
        assert received == []

    async def test_invalid_utf8_payload_rejected(self, client) -> None:
        await client.register_listener(TOPIC, lambda _: None)
        with pytest.raises(InvalidError, match="UTF-8"):
            await client.ingress(_request(payload=b"\xff\xfe"))

    async def test_ingress_marks_transport_connected(self, client) -> None:
        assert not client.connection_state.is_connected
        await client.ingress(_request())
        assert client.connection_state.is_connected


@pytest.mark.asyncio
class TestIngressAuth:
    async def test_bearer_valid_token_accepted(self) -> None:
        client = _make_client(auth="bearer", secret="s3cret")
        result = await client.ingress(
            _request(headers={"authorization": "Bearer s3cret"})
        )
        assert result.matched == 0

    async def test_bearer_invalid_token_rejected(self) -> None:
        client = _make_client(auth="bearer", secret="s3cret")
        with pytest.raises(UnauthorizedError):
            await client.ingress(_request(headers={"authorization": "Bearer wrong"}))

    async def test_bearer_missing_header_rejected(self) -> None:
        client = _make_client(auth="bearer", secret="s3cret")
        with pytest.raises(UnauthorizedError):
            await client.ingress(_request())

    async def test_hmac_valid_signature_accepted(self) -> None:
        client = _make_client(auth="hmac_sha256", secret="k3y")
        payload = b'{"temperature": 21.5}'
        digest = hmac.new(b"k3y", payload, hashlib.sha256).hexdigest()
        result = await client.ingress(
            _request(payload=payload, headers={"x-signature-256": f"sha256={digest}"})
        )
        assert result.matched == 0

    async def test_hmac_invalid_signature_rejected(self) -> None:
        client = _make_client(auth="hmac_sha256", secret="k3y")
        with pytest.raises(UnauthorizedError):
            await client.ingress(
                _request(headers={"x-signature-256": "sha256=" + "0" * 64})
            )

    async def test_hmac_missing_header_rejected(self) -> None:
        client = _make_client(auth="hmac_sha256", secret="k3y")
        with pytest.raises(UnauthorizedError):
            await client.ingress(_request())

    async def test_rejected_push_is_not_dispatched(self) -> None:
        client = _make_client(auth="bearer", secret="s3cret")
        received: list[str] = []
        await client.register_listener(TOPIC, received.append)
        with pytest.raises(UnauthorizedError):
            await client.ingress(_request())
        assert received == []

    async def test_auth_none_ignores_credentials(self, client) -> None:
        result = await client.ingress(
            _request(headers={"authorization": "Bearer whatever"})
        )
        assert result.matched == 0


@pytest.mark.asyncio
class TestReadWrite:
    """The transport is push-only: a cached read would log a READ-ok entry
    and mask watchdog-detected silence, so both directions raise."""

    async def test_read_is_not_supported(self, client) -> None:
        await client.register_listener(TOPIC, lambda _: None)
        await client.ingress(_request())
        with pytest.raises(InvalidError, match="ingress-only"):
            await client.read(WebhookAddress(topic=TOPIC))

    async def test_write_is_not_supported(self, client) -> None:
        with pytest.raises(InvalidError, match="ingress-only"):
            await client.write(WebhookAddress(topic=TOPIC), 21.5)


@pytest.mark.asyncio
class TestLifecycle:
    async def test_connect_marks_connected(self, client) -> None:
        await client.connect()
        assert client.connection_state.is_connected

    async def test_close_marks_closed(self, client) -> None:
        await client.connect()
        await client.close()
        assert not client.connection_state.is_connected

    async def test_register_listener_marks_connected(self, client) -> None:
        await client.register_listener(TOPIC, lambda _: None)
        assert client.connection_state.is_connected
