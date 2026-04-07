"""Unit tests for PhysicalDevice push-transport behaviour."""

import pytest

from devices_manager.core.device import DeviceBase, PhysicalDevice
from devices_manager.core.driver import (
    AttributeDriver,
    DeviceConfigField,
    Driver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.core.value_adapters.factory import ValueAdapterSpec
from devices_manager.types import DataType, TransportProtocols


def _make_push_driver(
    attributes: dict[str, AttributeDriver],
) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="push_driver"),
        env={},
        device_config_required=[DeviceConfigField(name="device_id", required=True)],
        transport=TransportProtocols.MQTT,
        update_strategy=UpdateStrategy(),
        attributes=attributes,
    )


def _make_pull_driver(
    attributes: dict[str, AttributeDriver],
) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="pull_driver"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.HTTP,
        update_strategy=UpdateStrategy(),
        attributes=attributes,
    )


def _identity_attr(
    name: str,
    *,
    listen: str | None = None,
    read_request: dict | None = None,
    read: str | None = None,
    write: dict | None = None,
) -> AttributeDriver:
    return AttributeDriver(
        name=name,
        data_type=DataType.FLOAT,
        listen=listen,
        read_request=read_request,
        read=read,
        write=write,
        value_adapter_specs=[ValueAdapterSpec(adapter="identity", argument="")],
    )


class TestInitListeners:
    @pytest.mark.asyncio
    async def test_registers_listener_for_listen_attribute(
        self, mock_push_transport_client
    ):
        driver = _make_push_driver(
            {"temperature": _identity_attr("temperature", listen="dev/snapshot")}
        )
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="D", config={"device_id": "abc"}),
            driver=driver,
            transport=mock_push_transport_client,
        )

        await device.init_listeners()

        listeners = mock_push_transport_client._listener_registry.get_by_address_id(
            "dev/snapshot"
        )
        assert len(listeners) == 1

    @pytest.mark.asyncio
    async def test_skips_attribute_without_listen(self, mock_push_transport_client):
        """An attribute with no listen field must not trigger register_listener."""
        driver = _make_push_driver(
            {"temperature": _identity_attr("temperature", read="GET /temperature")}
        )
        device = PhysicalDevice.from_base(
            DeviceBase(id="d2", name="D", config={"device_id": "abc"}),
            driver=driver,
            transport=mock_push_transport_client,
        )

        await device.init_listeners()

        listeners = mock_push_transport_client._listener_registry.get_by_address_id(
            "GET /temperature"
        )
        assert len(listeners) == 0

    @pytest.mark.asyncio
    async def test_registers_only_listen_attributes_skips_others(
        self, mock_push_transport_client
    ):
        driver = _make_push_driver(
            {
                "temperature": _identity_attr("temperature", listen="dev/snapshot"),
                "setpoint": _identity_attr(
                    "setpoint",
                    listen="dev/snapshot",
                    read_request={"topic": "dev/get", "message": "x"},
                ),
                "no_listen": _identity_attr("no_listen", read="GET /noop"),
            }
        )
        device = PhysicalDevice.from_base(
            DeviceBase(id="d3", name="D", config={"device_id": "abc"}),
            driver=driver,
            transport=mock_push_transport_client,
        )

        await device.init_listeners()

        listeners = mock_push_transport_client._listener_registry.get_by_address_id(
            "dev/snapshot"
        )
        assert len(listeners) == 2


class TestBuildReadRawAddress:
    def test_push_with_listen_and_read_request_returns_composite(
        self, mock_push_transport_client
    ):
        """Push transport + listen + read_request → composite dict."""
        attr = _identity_attr(
            "temperature",
            listen="dev/snapshot",
            read_request={"topic": "dev/get", "message": "x"},
        )
        driver = _make_push_driver({"temperature": attr})
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="D", config={"device_id": "abc"}),
            driver=driver,
            transport=mock_push_transport_client,
        )

        result = device._build_read_raw_address(attr, {})

        assert result == {
            "topic": "dev/snapshot",
            "request": {"topic": "dev/get", "message": "x"},
        }

    def test_push_with_listen_only_returns_bare_string(
        self, mock_push_transport_client
    ):
        """Push transport + listen only (no read_request) → bare topic string."""
        attr = _identity_attr("temperature", listen="dev/snapshot")
        driver = _make_push_driver({"temperature": attr})
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="D", config={"device_id": "abc"}),
            driver=driver,
            transport=mock_push_transport_client,
        )

        result = device._build_read_raw_address(attr, {})

        assert result == "dev/snapshot"

    def test_non_push_transport_uses_read_field(self, mock_transport_client):
        """Non-push transport → uses attribute_driver.read directly."""
        attr = _identity_attr("temperature", read="GET /temperature")
        driver = _make_pull_driver({"temperature": attr})
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="D", config={}),
            driver=driver,
            transport=mock_transport_client,
        )

        result = device._build_read_raw_address(attr, {})

        assert result == "GET /temperature"

    def test_no_read_address_raises(self, mock_transport_client):
        """Attribute with no listen and no read → ValueError."""
        attr = _identity_attr("temperature")  # no listen, no read
        driver = _make_pull_driver({"temperature": attr})
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="D", config={}),
            driver=driver,
            transport=mock_transport_client,
        )

        with pytest.raises(ValueError, match="has no read address"):
            device._build_read_raw_address(attr, {})

    def test_listen_template_rendered_with_context(self, mock_push_transport_client):
        """Template placeholders in listen are resolved using context."""
        attr = _identity_attr("temperature", listen="dev/${device_id}/snapshot")
        driver = _make_push_driver({"temperature": attr})
        device = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="D", config={"device_id": "abc"}),
            driver=driver,
            transport=mock_push_transport_client,
        )

        result = device._build_read_raw_address(attr, {"device_id": "abc"})

        assert result == "dev/abc/snapshot"
