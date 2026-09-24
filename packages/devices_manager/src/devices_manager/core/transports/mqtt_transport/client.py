import asyncio
import json
import logging
import ssl
import tempfile
from contextlib import suppress
from pathlib import Path

import aiomqtt

from devices_manager.core.transports import PushTransportClient
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.listener_registry import (
    ListenerCallback,
    ListenerRegistry,
)
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.core.utils.templating.render import render_struct
from devices_manager.types import AttributeValueType, TransportProtocols

from .mqtt_address import MqttAddress
from .topic_handler_registry import TopicHandlerRegistry
from .transport_config import MqttTransportConfig

TIMEOUT = 10

logger = logging.getLogger(__name__)


def build_ssl_context(config: MqttTransportConfig) -> ssl.SSLContext:
    """load_cert_chain needs file paths, so cert/key are written to temp files."""
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    if config.tls_insecure:
        # Bypass CN/SAN-vs-host verification (mosquitto `--insecure`). The
        # chain is still checked against the CA below; only the hostname
        # match is skipped, so it must be set before load_verify_locations.
        context.check_hostname = False
    if config.ca_cert:
        context.load_verify_locations(cadata=config.ca_cert)
    else:
        context.load_default_certs()
    if config.client_cert and config.client_key:
        with tempfile.TemporaryDirectory() as tmp_dir:
            cert_path = Path(tmp_dir) / "client_cert.pem"
            key_path = Path(tmp_dir) / "client_key.pem"
            cert_path.write_text(config.client_cert)
            key_path.write_text(config.client_key)
            context.load_cert_chain(certfile=cert_path, keyfile=key_path)
    return context


class MqttTransportClient(PushTransportClient[MqttAddress]):
    _client_instance: aiomqtt.Client | None = None
    # The current client's receive loop, kept apart from the base class's
    # background tasks: close() stops this task only, so a reconnect that
    # closes the transport never cancels itself.
    _message_task: asyncio.Task[None] | None = None
    _config_builder = MqttTransportConfig
    protocol = TransportProtocols.MQTT
    address_builder = MqttAddress
    config: MqttTransportConfig
    _handlers_registry: ListenerRegistry

    _message_handlers: (
        TopicHandlerRegistry  # maps topics to handler ids from handlers_registry
    )

    def __init__(
        self, metadata: TransportMetadata, config: MqttTransportConfig
    ) -> None:
        self._message_handlers = TopicHandlerRegistry()
        self._connection_lock = asyncio.Lock()
        self._handlers_registry = ListenerRegistry()
        super().__init__(metadata, config)

    async def connect(self) -> None:
        async with self._connection_lock:
            self._raise_if_terminally_rejected()
            if self.connection_state.is_connected:
                # Already connected — keep the live client. Rebuilding it here
                # would replace the entered client with an un-entered one while
                # leaving the state "connected", so later reads/writes would hit
                # a disconnected client ("client is not currently connected").
                return
            # A client the broker dropped is left, never reused.
            await self._discard_client()
            tls_context = (
                await asyncio.to_thread(build_ssl_context, self.config)
                if self.config.tls
                else None
            )
            client = aiomqtt.Client(
                self.config.host,
                port=self.config.port,
                username=self.config.username,
                password=self.config.password,
                tls_context=tls_context,
            )
            logger.debug(
                "MQTT connecting to %s:%s (tls=%s)",
                self.config.host,
                self.config.port,
                self.config.tls,
            )
            await asyncio.wait_for(client.__aenter__(), timeout=TIMEOUT)
            try:
                await self._resubscribe(client)
            except BaseException:
                with suppress(aiomqtt.MqttError):
                    await client.__aexit__(None, None, None)
                raise
            logger.debug("MQTT connected to %s:%s", self.config.host, self.config.port)
            self._client_instance = client
            self._message_task = asyncio.create_task(
                self._handle_incoming_messages(client)
            )
            await super().connect()

    async def close(self) -> None:
        """Disconnect from the MQTT broker and stay disconnected."""
        self._stop_reconnecting()
        async with self._connection_lock:
            await self._discard_client()
            await super().close()

    def _stop_reconnecting(self) -> None:
        """End a reconnection scheduled earlier, so that a deleted transport or
        a stopped service does not reconnect once the broker is back. The
        reconnection that is itself closing the transport carries on."""
        task = self._reconnect_task
        if task is not None and task is not asyncio.current_task() and not task.done():
            self._reconnect_pending = False
            task.cancel()

    async def _discard_client(self) -> None:
        """Stop receiving, then leave the client.

        Receiving stops first: aiomqtt ends its message iterator with an error
        on any disconnection, and a deliberate one must not be taken for a
        dropped session.
        """
        task, self._message_task = self._message_task, None
        if task is not None and not task.done():
            task.cancel()
            # wait() rather than await: the caller's own cancellation must
            # still reach it, only the loop's is expected here.
            await asyncio.wait({task})
        client, self._client_instance = self._client_instance, None
        if client is not None:
            with suppress(aiomqtt.MqttError):
                await client.__aexit__(None, None, None)

    async def _resubscribe(self, client: aiomqtt.Client) -> None:
        """Subscribe a new client to every topic still listened to, in one
        request: a broker forgets the subscriptions of a session it dropped."""
        topics = self._message_handlers.list_topics()
        if topics:
            await client.subscribe([(topic, 0) for topic in topics], timeout=TIMEOUT)

    def _on_connection_lost(self, error: aiomqtt.MqttError) -> None:
        """The broker dropped the session: park the state and reconnect with
        backoff, as OPC-UA does for a lost session."""
        logger.warning(
            "[Transport %s] MQTT session lost — %s: %s",
            self.id,
            type(error).__name__,
            error,
        )
        self.connection_state = TransportConnectionState.connection_error(str(error))
        self.schedule_reconnect()

    @property
    def _client(self) -> aiomqtt.Client:
        if not self._client_instance:
            msg = "Accessing mqtt client when undefined"
            raise ValueError(msg)
        return self._client_instance

    async def register_listener(
        self, address: MqttAddress, callback: ListenerCallback
    ) -> str:
        topic = address.topic
        if address.match is not None:
            # Every attribute of a device may listen on the same topic: without
            # a match, each frame would go through every attribute's codec.
            callback = address.match.only_matching(callback)
        listener_id = self._handlers_registry.register(topic, callback)
        await self._subscribe(topic)
        self._message_handlers.register(topic, listener_id)
        logger.debug("New listener registered on topic %s", topic)
        return listener_id

    async def unregister_listener(
        self, callback_id: str, topic: str | None = None
    ) -> None:
        # unregister from _message handler
        self._message_handlers.unregister(callback_id, topic)
        if topic and len(self._message_handlers.get_by_topic(topic)) == 0:
            # Await the unsubscribe: a detached task could run after a
            # sequential re-subscribe on the same topic and drop it, hanging
            # the next read until timeout.
            await self._unsubscribe(topic)

    @connected
    async def _subscribe(self, topic: str) -> None:
        await self._client.subscribe(topic)

    @connected
    async def _unsubscribe(self, topic: str) -> None:
        await self._client.unsubscribe(topic)

    async def _handle_incoming_messages(self, client: aiomqtt.Client) -> None:
        """Dispatch the client's messages until the broker drops the session."""
        try:
            async for message in client.messages:
                callback_ids = self._message_handlers.match_topic(message.topic)
                logger.debug(
                    "Handling new message on topic %s %s callbacks found",
                    message.topic,
                    len(callback_ids),
                )
                if callback_ids:
                    try:
                        decoded_payload = message.payload.decode()
                    except UnicodeDecodeError:
                        # A binary frame must not end reception for every device.
                        logger.warning(
                            "[Transport %s] skipped a non-UTF-8 frame on %s",
                            self.id,
                            message.topic,
                        )
                        continue
                    for callback_id in callback_ids:
                        try:
                            handler = self._handlers_registry.get_by_id(callback_id)
                            handler(decoded_payload)
                        except Exception:  # noqa: BLE001, S110
                            pass
        except aiomqtt.MqttError as e:
            self._on_connection_lost(e)

    @connected
    async def _read(
        self,
        address: MqttAddress,
    ) -> AttributeValueType:
        message = None
        message_event = asyncio.Event()

        def update_value(message_received: str) -> None:
            nonlocal message
            nonlocal message_event
            # The reply topic is shared by every attribute of the device, so a
            # frame answering another read, or pushed on change, can land
            # first: with a `match` declared, those are skipped, not returned.
            if address.match is not None and not address.match.accepts(
                message_received
            ):
                logger.debug(
                    "MQTT read: frame on %s is not the reply, waiting for the next",
                    address.topic,
                )
                return
            message = message_received
            message_event.set()

        listener_id = await self.register_listener(address, update_value)
        logger.debug("MQTT read: subscribed to reply topic %s", address.topic)

        if address.request is not None:
            payload = (
                json.dumps(address.request.message)
                if isinstance(address.request.message, dict)
                else address.request.message
            )
            logger.debug(
                "MQTT read: publishing request to topic %s: %s",
                address.request.topic,
                payload,
            )
            await self._client.publish(
                address.request.topic, payload=payload, timeout=TIMEOUT
            )
        else:
            logger.debug(
                "MQTT read: no request block on address; listen-only on %s "
                "(nothing published to the broker)",
                address.topic,
            )

        try:
            async with asyncio.timeout(TIMEOUT):
                await message_event.wait()
                if message is not None:
                    return message
        except TimeoutError as err:
            msg = f"MQTT: no reply received on {address.topic} before timeout"
            raise TimeoutError(msg) from err
        finally:
            await self.unregister_listener(listener_id, address.topic)
        msg = "Unable to read value"
        raise ValueError(msg)

    @connected
    async def write(self, address: MqttAddress, value: AttributeValueType) -> None:
        if address.message is None:
            msg = "Cannot write: address has no message template"
            raise ValueError(msg)
        message_template = address.message
        message = render_struct(
            message_template,
            {
                "value": json.dumps(value)
                if isinstance(message_template, str)
                else value
            },
        )
        payload = json.dumps(message) if isinstance(message, dict) else message

        await self._client.publish(address.topic, payload=payload, timeout=TIMEOUT)
