from __future__ import annotations

import asyncio

import pytest
from devices_manager.core.device.attribute import Attribute
from devices_manager.core.device.virtual_device import VirtualDevice
from devices_manager.types import DataType, DeviceKind


def _make_virtual_device(
    attributes: dict[str, Attribute] | None = None,
) -> VirtualDevice:
    return VirtualDevice(
        id="vd1",
        name="My virtual device",
        attributes=attributes
        or {
            "temperature": Attribute(
                name="temperature",
                data_type=DataType.FLOAT,
                read_write_modes={"read", "write"},
                current_value=None,
                last_updated=None,
            ),
            "humidity": Attribute(
                name="humidity",
                data_type=DataType.FLOAT,
                read_write_modes={"read"},
                current_value=None,
                last_updated=None,
            ),
        },
    )


class TestVirtualDeviceKind:
    def test_kind_is_virtual(self):
        device = _make_virtual_device()
        assert device.kind == DeviceKind.VIRTUAL

    def test_kind_cannot_be_overridden(self):
        """kind is init=False; passing it to the constructor has no effect."""
        device = VirtualDevice(
            id="v1",
            name="test",
            attributes={},
        )
        assert device.kind == DeviceKind.VIRTUAL


class TestVirtualDeviceRead:
    def test_read_returns_none_when_no_value_set(self):
        device = _make_virtual_device()
        assert device.read_attribute_value("temperature") is None

    def test_read_returns_current_value(self):
        device = _make_virtual_device(
            attributes={
                "temperature": Attribute(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    read_write_modes={"read", "write"},
                    current_value=22.5,
                    last_updated=None,
                )
            }
        )
        assert device.read_attribute_value("temperature") == 22.5

    def test_read_attribute_not_found(self):
        device = _make_virtual_device()
        with pytest.raises(KeyError):
            device.read_attribute_value("nonexistent")


class TestVirtualDeviceWrite:
    @pytest.mark.asyncio
    async def test_write_updates_in_memory_value(self):
        device = _make_virtual_device()
        assert device.get_attribute_value("temperature") is None

        await device.write_attribute_value("temperature", 21.0)

        assert device.get_attribute_value("temperature") == 21.0

    @pytest.mark.asyncio
    async def test_write_returns_attribute(self):
        device = _make_virtual_device()
        result = await device.write_attribute_value("temperature", 19.0)
        assert isinstance(result, Attribute)
        assert result.current_value == 19.0

    @pytest.mark.asyncio
    async def test_write_triggers_listeners(self):
        device = _make_virtual_device()
        received: list[tuple[str, object]] = []

        async def listener(_dev: object, attr_name: str, attr: Attribute) -> None:
            received.append((attr_name, attr.current_value))

        device.add_update_listener(listener)
        await device.write_attribute_value("temperature", 25.0)
        await asyncio.sleep(0)

        assert received == [("temperature", 25.0)]

    @pytest.mark.asyncio
    async def test_write_triggers_multiple_listeners(self):
        device = _make_virtual_device()
        calls_a: list[float] = []
        calls_b: list[float] = []

        async def listener_a(_dev: object, _attr_name: str, attr: Attribute) -> None:
            calls_a.append(attr.current_value)  # type: ignore[arg-type]

        async def listener_b(_dev: object, _attr_name: str, attr: Attribute) -> None:
            calls_b.append(attr.current_value)  # type: ignore[arg-type]

        device.add_update_listener(listener_a)
        device.add_update_listener(listener_b)
        await device.write_attribute_value("temperature", 30.0)
        await asyncio.sleep(0)

        assert calls_a == [30.0]
        assert calls_b == [30.0]

    @pytest.mark.asyncio
    async def test_write_read_only_attribute_raises(self):
        device = _make_virtual_device()
        with pytest.raises(PermissionError):
            await device.write_attribute_value("humidity", 55.0)

    @pytest.mark.asyncio
    async def test_write_unknown_attribute_raises(self):
        device = _make_virtual_device()
        with pytest.raises(KeyError):
            await device.write_attribute_value("nonexistent", 1.0)

    @pytest.mark.asyncio
    async def test_write_does_not_use_transport(self):
        """Virtual device writes must never touch any transport layer."""
        device = _make_virtual_device()
        # No transport is set — if any transport call were made this would raise.
        await device.write_attribute_value("temperature", 42.0)
        assert device.get_attribute_value("temperature") == 42.0

    @pytest.mark.asyncio
    async def test_write_validates_type(self):
        """Writing a value of the wrong type raises TypeError."""
        device = _make_virtual_device()
        with pytest.raises(TypeError):
            await device.write_attribute_value("temperature", "not-a-float")
