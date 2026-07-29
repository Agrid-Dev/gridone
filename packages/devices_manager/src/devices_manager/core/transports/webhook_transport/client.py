import logging

from devices_manager.core.transports import PushTransportClient
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.listener_registry import ListenerCallback
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.ingress import IngressRequest, IngressResult
from devices_manager.types import AttributeValueType, TransportProtocols
from models.errors import InvalidError

from .auth import verify_ingress_auth
from .transport_config import WebhookTransportConfig
from .webhook_address import WebhookAddress

logger = logging.getLogger(__name__)


class WebhookTransportClient(PushTransportClient[WebhookAddress]):
    """Ingress-only transport fed by HTTP pushes.

    A webhook endpoint is passive: there is no socket to open or monitor, so
    ``connect()`` only marks the client connected. Device health is measured
    by silence instead (``healthcheck.expected_push_interval`` drives the
    device-level ``SilenceWatchdog``).

    Topics are matched exactly — each device subscribes to its rendered path
    (e.g. ``${room_id}/snapshot``). Wildcard matching is out of scope.
    """

    _config_builder = WebhookTransportConfig
    protocol = TransportProtocols.WEBHOOK
    address_builder = WebhookAddress
    config: WebhookTransportConfig

    def __init__(
        self, metadata: TransportMetadata, config: WebhookTransportConfig
    ) -> None:
        super().__init__(metadata, config)
        # Last decoded payload per subscribed topic, serving `_read`.
        self._last_payloads: dict[str, str] = {}

    async def connect(self) -> None:
        await super().connect()

    async def close(self) -> None:
        await super().close()

    @connected
    async def register_listener(self, topic: str, callback: ListenerCallback) -> str:
        listener_id = self._handlers_registry.register(topic, callback)
        logger.debug("New listener registered on topic %s", topic)
        return listener_id

    async def unregister_listener(
        self, callback_id: str, topic: str | None = None
    ) -> None:
        self._handlers_registry.remove(callback_id, topic)

    @connected
    async def ingress(self, request: IngressRequest) -> IngressResult:
        """Verify credentials, then dispatch the payload to the listeners
        subscribed to the exact topic. Returns how many were dispatched to."""
        verify_ingress_auth(self.config, request.headers, request.payload)
        payload = self._decode_payload(request.payload)
        callbacks = self._handlers_registry.get_by_address_id(request.topic)
        if callbacks:
            self._last_payloads[request.topic] = payload
        for callback in callbacks:
            try:
                callback(payload)
            except Exception:
                logger.exception("Ingress listener failed on topic %s", request.topic)
        return IngressResult(matched=len(callbacks))

    @staticmethod
    def _decode_payload(payload: bytes) -> str:
        try:
            return payload.decode()
        except UnicodeDecodeError as e:
            msg = "Payload must be valid UTF-8"
            raise InvalidError(msg) from e

    async def _read(self, address: WebhookAddress) -> AttributeValueType:
        """Return the last payload pushed on the topic — a webhook cannot
        solicit data, so a read is served from what was already received."""
        try:
            return self._last_payloads[address.topic]
        except KeyError as e:
            msg = f"Webhook: no message received on topic {address.topic} yet"
            raise TimeoutError(msg) from e

    async def write(
        self,
        address: WebhookAddress,  # noqa: ARG002
        value: AttributeValueType,  # noqa: ARG002
    ) -> None:
        msg = "Webhook transport is ingress-only and does not support writes"
        raise InvalidError(msg)
