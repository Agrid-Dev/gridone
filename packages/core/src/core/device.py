import logging
from collections.abc import Callable
from dataclasses import dataclass

from core.types import AttributeValueType, DeviceConfig, TransportProtocols

from .attribute import Attribute
from .driver import Driver

logger = logging.getLogger(__name__)


@dataclass
class Device:
    id: str
    config: DeviceConfig
    driver: Driver
    attributes: dict[str, Attribute]

    @classmethod
    def from_driver(cls, driver: Driver, config: DeviceConfig) -> "Device":
        return cls(
            id="my-device",  # TODO build ids  # noqa: FIX002, TD002, TD003, TD004
            driver=driver,
            config=config,
            attributes={
                a.name: Attribute.create(
                    a.name,
                    a.data_type,
                    {"read", "write"} if a.write is not None else {"read"},
                )
                for a in driver.schema.attribute_schemas
            },
        )

    def __post_init__(self) -> None:
        """Upon init, attach attribute updaters to the transport."""
        for attribute in self.attributes.values():

            def updater(
                new_value: AttributeValueType, attribute=attribute
            ) -> None:  # noqa: ANN001
                return attribute.update_value(new_value)

            self.driver.attach_updater(attribute.name, self.config, updater)

        # Register device with transport for dynamic notification registration
        if self.driver.transport.protocol == TransportProtocols.MQTT:
            # Import here to avoid circular dependency
            from core.transports.mqtt_transport.client import MqttTransportClient

            if isinstance(self.driver.transport, MqttTransportClient):
                self.driver.transport.register_device(self)

        # Automatically register for notifications if device has id or gateway_id in config
        if self.driver.transport.protocol == TransportProtocols.MQTT:
            device_id = self.config.get("id")
            device_gateway_id = self.config.get("gateway_id")
            if device_id is not None or device_gateway_id is not None:
                logger.debug(
                    f"Auto-registering device {self.id} for notifications "
                    f"(id: {device_id}, gateway_id: {device_gateway_id})"
                )
                self.register_for_notifications()

    def get_attribute(self, attribute_name: str) -> Attribute:
        try:
            return self.attributes[attribute_name]
        except KeyError as ke:
            msg = f"Attribute '{attribute_name}' not found in device '{self.id}'"
            raise KeyError(msg) from ke

    def get_attribute_value(self, attribute_name: str) -> AttributeValueType | None:
        return self.get_attribute(attribute_name).current_value

    async def read_attribute_value(
        self,
        attribute_name: str,
    ) -> AttributeValueType | None:
        attribute = self.get_attribute(attribute_name)
        new_value = await self.driver.read_value(attribute_name, self.config)
        attribute.update_value(new_value)
        return attribute.current_value

    async def write_attribute_value(
        self,
        attribute_name: str,
        value: AttributeValueType,
    ) -> AttributeValueType:
        attribute = self.get_attribute(attribute_name)
        if "write" not in attribute.read_write_modes:
            msg = f"Attribute '{attribute_name}' is not writable on device '{self.id}'"
            raise PermissionError(msg)
        validated_value = attribute.ensure_type(value)
        await self.driver.write_value(attribute_name, self.config, validated_value)
        attribute.update_value(validated_value)
        return attribute.current_value

    def register_for_notifications(
        self, device_id_matcher: Callable[[dict], bool] | None = None
    ) -> None:
        """Register this device to receive and process agrid-notify messages.

        Args:
            device_id_matcher: Optional function that takes a notification dict
                (with 'id' and 'gateway_id' keys) and returns True if it matches
                this device. If None, uses a default matcher based on device config
                'id' and 'gateway_id' fields.
        """
        if self.driver.transport.protocol != TransportProtocols.MQTT:
            return  # Only MQTT supports notifications

        # Import here to avoid circular dependency
        from core.transports.mqtt_transport.client import MqttTransportClient

        if not isinstance(self.driver.transport, MqttTransportClient):
            return

        # Default matcher: check if notification id and gateway_id match device config
        if device_id_matcher is None:
            device_id = self.config.get("id")
            device_gateway_id = self.config.get("gateway_id")

            def default_matcher(notification_data: dict) -> bool:
                notification_id = notification_data.get("id", "")
                notification_gateway_id = notification_data.get("gateway_id", "")

                # Match id if configured
                id_matches = True
                if device_id is not None:
                    id_matches = notification_id == device_id
                    if not id_matches:
                        logger.debug(
                            f"Notification ID '{notification_id}' does not match "
                            f"device config ID '{device_id}' for device {self.id}"
                        )
                        return False

                # Match gateway_id if configured
                gateway_matches = True
                if device_gateway_id is not None:
                    gateway_matches = notification_gateway_id == device_gateway_id
                    if not gateway_matches:
                        logger.debug(
                            f"Notification gateway_id '{notification_gateway_id}' "
                            f"does not match device config gateway_id "
                            f"'{device_gateway_id}' for device {self.id}"
                        )
                        return False

                # If neither id nor gateway_id are configured, reject all notifications
                # Devices must have at least 'id' configured to receive notifications
                if device_id is None and device_gateway_id is None:
                    logger.debug(
                        f"No id or gateway_id configured for device {self.id}, "
                        f"rejecting notification (id: '{notification_id}', "
                        f"gateway_id: '{notification_gateway_id}')"
                    )
                    return False

                return id_matches and gateway_matches

            device_id_matcher = default_matcher

        def notification_handler(notification_data: dict) -> None:
            """Handle notification and update device attributes."""
            notification_id = notification_data.get("id", "")
            notification_gateway_id = notification_data.get("gateway_id", "")
            logger.debug(
                f"Checking notification (id: '{notification_id}', "
                f"gateway_id: '{notification_gateway_id}') against device {self.id} "
                f"(config id: {self.config.get('id', 'N/A')}, "
                f"config gateway_id: {self.config.get('gateway_id', 'N/A')})"
            )
            if not device_id_matcher(notification_data):
                logger.debug(
                    f"Notification (id: '{notification_id}', "
                    f"gateway_id: '{notification_gateway_id}') "
                    f"does not match device {self.id}"
                )
                return  # Not for this device

            logger.info(
                f"NOTIFICATION MATCHED - Device: {self.id}, "
                f"Notification ID: {notification_id}"
            )

            payload = notification_data.get("payload", {})
            if not isinstance(payload, dict):
                return

            # Map notification payload fields to device attributes
            # Common mappings:
            attribute_mappings = {
                "temperature": "temperature",
                "set_temperature": "temperature_setpoint",
                "state": "state",
            }

            updated_attributes = []
            # Update attributes from notification payload
            for notification_key, attribute_name in attribute_mappings.items():
                if notification_key in payload and attribute_name in self.attributes:
                    try:
                        value = payload[notification_key]
                        old_value = self.attributes[attribute_name].current_value
                        # Convert state: 1 -> True, 0 -> False if attribute is bool
                        if attribute_name == "state" and isinstance(value, int):
                            value = bool(value)
                        self.attributes[attribute_name].update_value(value)
                        updated_attributes.append(
                            f"{attribute_name}: {old_value} -> {value}"
                        )
                    except Exception:  # noqa: BLE001
                        # Skip attributes that can't be updated
                        pass

            if updated_attributes:
                attrs_str = ", ".join(updated_attributes)
                logger.info(
                    f"NOTIFICATION UPDATED - Device: {self.id}, "
                    f"Attributes: {attrs_str}"
                )

        self.driver.transport.register_notification_handler(notification_handler)
