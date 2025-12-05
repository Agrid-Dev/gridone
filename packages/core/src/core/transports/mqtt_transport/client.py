import asyncio
import json
import logging
from collections.abc import Callable
from typing import TYPE_CHECKING, Any, Union

import aiomqtt

from core.transports import TransportClient
from core.transports.connected import connected
from core.transports.read_handler_registry import ReadHandler
from core.types import AttributeValueType, TransportProtocols
from core.utils.templating.render import render_struct

from .mqtt_address import MqttAddress
from .topic_handler_registry import TopicHandlerRegistry
from .transport_config import MqttTransportConfig

if TYPE_CHECKING:
    from core.device import Device

TIMEOUT = 10

logger = logging.getLogger(__name__)


class MqttTransportClient(TransportClient[MqttAddress]):
    _client: aiomqtt.Client
    protocol = TransportProtocols.MQTT
    address_builder = MqttAddress
    config: MqttTransportConfig
    _connection_lock: asyncio.Lock
    _is_connected: bool
    _background_tasks: set
    _message_handlers: (
        TopicHandlerRegistry  # maps topics to handler ids from handlers_registry
    )
    _notification_handlers: list[Callable[[dict[str, Any]], None]]
    _registered_devices: list["Device"]
    _devices_by_id: dict[str, "Device"]  # Track devices by their id
    _device_factory: Callable[[str, str | None], "Device"] | None

    def __init__(self, config: MqttTransportConfig) -> None:
        self.config = config
        self._message_handlers = TopicHandlerRegistry()
        self._notification_handlers: list[Callable[[dict[str, Any]], None]] = []
        self._registered_devices: list["Device"] = []
        self._devices_by_id: dict[str, "Device"] = {}
        self._device_factory: Callable[[str, str | None], "Device"] | None = None
        self._background_tasks: set[asyncio.Task] = set()
        self._connection_lock = asyncio.Lock()
        self._is_connected = False
        super().__init__()

    async def connect(self) -> None:
        async with self._connection_lock:
            if not self._is_connected:
                self._client = aiomqtt.Client(self.config.host, port=self.config.port)
                await self._client.__aenter__()
                self._is_connected = True
                # Subscribe to all topics for logging purposes
                await self._client.subscribe("#")
                # Also explicitly subscribe to agrid-notify topic
                await self._client.subscribe("agrid-notify")
                self._background_tasks.add(
                    asyncio.create_task(self._handle_incoming_messages())
                )

    async def close(self) -> None:
        """Disconnect from the MQTT broker."""
        if self._client:
            await self._client.__aexit__(None, None, None)
            self._is_connected = False
        for task in self._background_tasks:
            task.cancel()
        self._background_tasks.clear()

    def register_read_handler(self, address: MqttAddress, handler: ReadHandler) -> str:
        handler_id = super().register_read_handler(address, handler)
        self._message_handlers.register(address.topic, handler_id)
        task = asyncio.create_task(self._subscribe(address.topic))
        self._background_tasks.add(task)
        return handler_id

    def unregister_read_handler(
        self, handler_id: str, address: MqttAddress | None = None
    ) -> None:
        # unregister from _message handler
        topic = address.topic if address else None
        self._message_handlers.unregister(handler_id, topic)
        if topic and len(self._message_handlers.get_by_topic(topic)) == 0:
            # no other handlers on this topic, unsubscribe
            asyncio.create_task(self._unsubscribe(topic)).add_done_callback(
                lambda task: task.exception()  # Silently consume the exception
            )

        return super().unregister_read_handler(handler_id, address)

    @connected
    async def _subscribe(self, topic: str) -> None:
        await self._client.subscribe(topic)

    @connected
    async def _unsubscribe(self, topic: str) -> None:
        await self._client.unsubscribe(topic)

    def register_device(self, device: "Device") -> None:
        """Register a device instance to enable dynamic notification registration.

        When notifications arrive with id and gateway_id, matching devices
        will be automatically registered for notifications if not already registered.
        """
        # Identity check avoids dropping devices that compare equal but represent distinct instances.
        if any(
            registered_device is device for registered_device in self._registered_devices
        ):
            return
        self._registered_devices.append(device)
        logger.info(
            "Registered device %s for dynamic notification matching", device.id
        )
        # Track device by its id if it has one
        device_id = device.config.get("id")
        if device_id is not None:
            self._devices_by_id[device_id] = device

    def register_device_factory(
        self, factory: Callable[[str, str | None], "Device"]
    ) -> None:
        """Register a factory function to create devices dynamically.

        The factory function should take (device_id: str, gateway_id: str | None)
        and return a Device instance. This will be called when a notification
        arrives with an id that doesn't match any existing device.
        """
        self._device_factory = factory
        logger.info("Registered device factory for dynamic device creation")

    def register_notification_handler(
        self, handler: Callable[[dict[str, Any]], None]
    ) -> None:
        """Register a handler for agrid-notify messages.

        The handler will be called with a dict containing:
        - command: str (e.g., "notify")
        - id: str (device identifier)
        - payload: dict (attribute values)
        - gateway_id: str (optional)
        """
        self._notification_handlers.append(handler)

    def unregister_notification_handler(
        self, handler: Callable[[dict[str, Any]], None]
    ) -> None:
        """Unregister a notification handler."""
        if handler in self._notification_handlers:
            self._notification_handlers.remove(handler)

    def _process_notification(self, payload: str) -> None:
        """Process an agrid-notify message and call registered handlers.

        Also checks registered devices and auto-registers matching devices
        based on id and gateway_id from the notification.
        """
        try:
            notification_data = json.loads(payload)
            logger.info("Received notification: %s", notification_data)
            if notification_data.get("command") == "notify":
                # Extract id and gateway_id from notification
                notification_id = notification_data.get("id")
                notification_gateway_id = notification_data.get("gateway_id")
                logger.info(
                    "Received notification for id=%s, gateway_id=%s",
                    notification_id,
                    notification_gateway_id,
                )

                # Check registered devices and auto-register matching ones
                if notification_id is not None or notification_gateway_id is not None:
                    self._auto_register_devices_for_notification(
                        notification_id, notification_gateway_id
                    )

                # Call registered handlers
                for handler in self._notification_handlers:
                    try:
                        handler(notification_data)
                    except Exception as e:  # noqa: BLE001
                        logger.warning(
                            "Error in notification handler: %s", e, exc_info=True
                        )
        except json.JSONDecodeError as e:
            logger.warning("Failed to parse notification JSON: %s", e)
        except Exception as e:  # noqa: BLE001
            logger.warning("Error processing notification: %s", e, exc_info=True)

    def _auto_register_devices_for_notification(
        self, notification_id: str | None, notification_gateway_id: str | None
    ) -> None:
        """Auto-register devices matching notification's id and gateway_id.

        When a notification arrives with id and gateway_id, this method:
        1. Checks if a device with the notification's id already exists
        2. If not, tries to create one using the device factory (if registered)
        3. Checks all registered devices for matching id/gateway_id
        4. Registers matching devices for notifications
        """
        if notification_id is None and notification_gateway_id is None:
            return  # No identifiers to match against

        logger.info(
            "Auto-registering devices for notification id=%s gateway_id=%s "
            "(%d registered devices)",
            notification_id,
            notification_gateway_id,
            len(self._registered_devices),
        )

        # Check if we already have a device with this id
        device_for_id = None
        if notification_id is not None:
            device_for_id = self._devices_by_id.get(notification_id)

        # If no device exists with this id, try to create one using factory
        if device_for_id is None and notification_id is not None:
            device_for_id = self._try_create_device_from_notification(
                notification_id, notification_gateway_id
            )

        # Process all registered devices (including newly created ones)
        devices_to_check = list(self._registered_devices)
        if device_for_id is not None and device_for_id not in devices_to_check:
            devices_to_check.append(device_for_id)

        for device in devices_to_check:
            try:
                self._try_register_device_for_notification(
                    device, notification_id, notification_gateway_id
                )
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "Error auto-registering device for notification: %s",
                    e,
                    exc_info=True,
                )

    def _try_create_device_from_notification(
        self, notification_id: str, notification_gateway_id: str | None
    ) -> Union["Device", None]:
        """Try to create a device from a notification using the device factory."""
        if self._device_factory is None:
            return None

        try:
            device = self._device_factory(notification_id, notification_gateway_id)
            # Register the newly created device
            self.register_device(device)
            logger.info(
                "Created new device with id=%s, gateway_id=%s from notification",
                notification_id,
                notification_gateway_id,
            )
            return device
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "Failed to create device from notification (id=%s): %s",
                notification_id,
                e,
                exc_info=True,
            )
            return None

    def _try_register_device_for_notification(
        self,
        device: "Device",
        notification_id: str | None,
        notification_gateway_id: str | None,
    ) -> None:
        """Try to register a single device for notifications."""
        device_config = device.config
        device_id = device_config.get("id")
        device_gateway_id = device_config.get("gateway_id")

        logger.info(
            "Checking device %s (config id=%s gateway=%s) against notification "
            "id=%s gateway=%s",
            device.id,
            device_id,
            device_gateway_id,
            notification_id,
            notification_gateway_id,
        )

        # Check if device matches this notification by id
        id_matches = (
            notification_id is not None
            and device_id is not None
            and device_id == notification_id
        )

        # If id matches, this device should handle the notification
        if id_matches:
            self._update_and_register_device(
                device,
                device_config,
                notification_id,
                notification_gateway_id,
                device_gateway_id,
            )
            logger.info(
                "Notification %s matched device %s by id=%s",
                notification_id,
                device.id,
                device_id,
            )
            return

        # If device doesn't have an id, try to assign one from notification
        if (
            device_id is None
            and notification_id is not None
            and notification_id not in self._devices_by_id
        ):
            device_config["id"] = notification_id
            self._devices_by_id[notification_id] = device
            self._update_and_register_device(
                device,
                device_config,
                notification_id,
                notification_gateway_id,
                device_gateway_id,
                config_updated=True,
            )
            logger.info(
                "Assigned notification id=%s to device %s (no previous id)",
                notification_id,
                device.id,
            )
            return

        gateway_matches = (
            notification_gateway_id is not None
            and device_gateway_id == notification_gateway_id
            and device_id is None
        )

        if (
            gateway_matches
            and notification_id is not None
            and notification_id not in self._devices_by_id
        ):
            # Assign id and register
            device_config["id"] = notification_id
            self._devices_by_id[notification_id] = device
            self._update_and_register_device(
                device,
                device_config,
                notification_id,
                notification_gateway_id,
                device_gateway_id,
                config_updated=True,
            )
            logger.info(
                "Assigned id=%s to device %s via gateway match (gateway_id=%s)",
                notification_id,
                device.id,
                notification_gateway_id,
            )

    def _update_and_register_device(
        self,
        device: "Device",
        device_config: dict,
        notification_id: str | None,
        notification_gateway_id: str | None,
        device_gateway_id: str | None,
        *,
        config_updated: bool = False,
    ) -> None:
        """Update device config and register for notifications."""
        # Update gateway_id if provided and not set
        if notification_gateway_id is not None and device_gateway_id is None:
            device_config["gateway_id"] = notification_gateway_id
            config_updated = True

        if config_updated:
            logger.info(
                "Updated device %s config with id=%s, gateway_id=%s "
                "from notification",
                device.id,
                notification_id,
                notification_gateway_id,
            )

        # Register the device for notifications
        logger.info(
            "Registering device %s for notifications (config: %s)",
            device.id,
            device_config,
        )
        device.register_for_notifications()
        if config_updated:
            logger.info(
                "Auto-registered device %s for notifications "
                "based on incoming notification (id: %s, gateway_id: %s)",
                device.id,
                notification_id,
                notification_gateway_id,
            )

    @connected
    async def _handle_incoming_messages(self) -> None:
        async for message in self._client.messages:
            try:
                decoded_payload = message.payload.decode()  # ty: ignore[possibly-missing-attribute]
            except Exception:  # noqa: BLE001
                logger.info(
                    "MQTT RECEIVED - Topic: %s, Payload: <binary or decode error>",
                    message.topic.value,
                )
                decoded_payload = None
            # Process notifications on agrid-notify topic
            if message.topic.value == "agrid-notify" and decoded_payload is not None:
                self._process_notification(decoded_payload)

            handler_ids = self._message_handlers.match_topic(message.topic)
            if handler_ids and decoded_payload is not None:
                for handler_id in handler_ids:
                    try:
                        handler = self._handlers_registry.get_by_id(handler_id)
                        handler(decoded_payload)
                    except Exception:  # noqa: BLE001, S110
                        pass

    @connected
    async def read(
        self,
        address: MqttAddress,
    ) -> AttributeValueType:
        message = None
        message_event = asyncio.Event()

        def update_value(message_received: str) -> None:
            nonlocal message
            nonlocal message_event
            message = message_received
            message_event.set()

        handler_id = self.register_read_handler(address, update_value)

        payload = (
            json.dumps(address.request.message)
            if isinstance(address.request.message, dict)
            else address.request.message
        )
        logger.info(
            "MQTT PUBLISH - Topic: %s, Payload: %s",
            address.request.topic,
            payload,
        )
        await self._client.publish(
            address.request.topic,
            payload=payload,
        )
        try:
            async with asyncio.timeout(TIMEOUT):
                await message_event.wait()
                if message is not None:
                    return message
        except TimeoutError as err:
            msg = "MQTT issue: no message received before timeout"
            raise TimeoutError(msg) from err
        finally:
            self.unregister_read_handler(handler_id, address)
        msg = "Unable to read value"
        raise ValueError(msg)

    @connected
    async def write(self, address: MqttAddress, value: AttributeValueType) -> None:
        message_template = address.request.message
        message = render_struct(
            message_template,
            {
                "value": json.dumps(value)
                if isinstance(message_template, str)
                else value
            },
        )
        payload = json.dumps(message) if isinstance(message, dict) else message

        logger.info(
            "MQTT PUBLISH - Topic: %s, Payload: %s",
            address.request.topic,
            payload,
        )
        await self._client.publish(address.request.topic, payload=payload)
