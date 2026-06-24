from __future__ import annotations

from datetime import UTC, datetime

import pytest

from devices_manager.core.device import (
    Attribute,
    DeviceBase,
    FaultAttribute,
    PhysicalDevice,
    VirtualDevice,
)
from devices_manager.core.device_filters import DeviceFilters
from devices_manager.types import DataType


def _virtual(
    device_id: str,
    name: str,
    *,
    device_type: str | None = None,
    tags: dict[str, str] | None = None,
    attributes: dict[str, Attribute] | None = None,
) -> VirtualDevice:
    if attributes is None:
        attributes = {"x": Attribute.create("x", DataType.FLOAT, {"read"})}
    device = VirtualDevice(
        id=device_id, name=name, type=device_type, attributes=attributes
    )
    if tags:
        device.tags = tags
    return device


def _fault_attr(name: str, *, faulty: bool) -> FaultAttribute:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return FaultAttribute(
        name=name,
        data_type=DataType.STRING,
        read_write_modes={"read"},
        current_value="error" if faulty else "ok",
        healthy_values=["ok"],
        last_updated=now,
        last_changed=now,
    )


def _writable_attrs() -> dict[str, Attribute]:
    return {"setpoint": Attribute.create("setpoint", DataType.FLOAT, {"read", "write"})}


class TestDeviceFiltersMatches:
    # -- no filters --

    def test_no_filters_matches_all(self):
        assert DeviceFilters().matches(_virtual("d1", "Device"))

    # -- ids --

    @pytest.mark.parametrize(
        ("filter_ids", "expected"),
        [
            pytest.param(frozenset(["d1"]), True, id="match"),
            pytest.param(frozenset(["d2"]), False, id="no_match"),
            pytest.param(None, True, id="no_filter"),
        ],
    )
    def test_ids(self, filter_ids, expected):
        assert (
            DeviceFilters(ids=filter_ids).matches(_virtual("d1", "Device")) is expected
        )

    # -- types --

    @pytest.mark.parametrize(
        ("filter_types", "expected"),
        [
            pytest.param(frozenset(["thermostat"]), True, id="match"),
            pytest.param(frozenset(["chiller"]), False, id="no_match"),
            pytest.param(None, True, id="no_filter"),
        ],
    )
    def test_types(self, filter_types, expected):
        assert (
            DeviceFilters(types=filter_types).matches(
                _virtual("d1", "Thermostat", device_type="thermostat")
            )
            is expected
        )

    def test_types_untyped_device_excluded(self):
        assert not DeviceFilters(types=frozenset(["thermostat"])).matches(
            _virtual("d1", "Device", device_type=None)
        )

    # -- writable_attribute --

    def test_writable_attribute_match(self):
        assert DeviceFilters(writable_attribute="setpoint").matches(
            _virtual("d1", "Device", attributes=_writable_attrs())
        )

    def test_writable_attribute_read_only_excluded(self):
        attrs = {"temp": Attribute.create("temp", DataType.FLOAT, {"read"})}
        assert not DeviceFilters(writable_attribute="temp").matches(
            _virtual("d1", "Device", attributes=attrs)
        )

    def test_writable_attribute_missing_excluded(self):
        assert not DeviceFilters(writable_attribute="nonexistent").matches(
            _virtual("d1", "Device")
        )

    def test_writable_attribute_none_matches_all(self):
        assert DeviceFilters(writable_attribute=None).matches(_virtual("d1", "Device"))

    # -- writable_attribute_type --

    @pytest.mark.parametrize(
        ("attr_type", "expected"),
        [
            pytest.param(DataType.FLOAT, True, id="match"),
            pytest.param(DataType.BOOL, False, id="no_match"),
        ],
    )
    def test_writable_attribute_type(self, attr_type, expected):
        device = _virtual("d1", "Device", attributes=_writable_attrs())
        assert (
            DeviceFilters(
                writable_attribute="setpoint", writable_attribute_type=attr_type
            ).matches(device)
            is expected
        )

    # -- tags --

    @pytest.mark.parametrize(
        ("filter_tags", "expected"),
        [
            pytest.param({"asset_id": frozenset(["floor1"])}, True, id="match"),
            pytest.param({"asset_id": frozenset(["floor2"])}, False, id="no_match"),
            pytest.param({}, True, id="empty_filter"),
            pytest.param(None, True, id="no_filter"),
        ],
    )
    def test_tags(self, filter_tags, expected):
        device = _virtual("d1", "Device", tags={"asset_id": "floor1"})
        assert DeviceFilters(tags=filter_tags).matches(device) is expected

    def test_tags_and_across_keys_all_match(self):
        device = _virtual(
            "d1", "Device", tags={"asset_id": "floor1", "region": "north"}
        )
        assert DeviceFilters(
            tags={"asset_id": frozenset(["floor1"]), "region": frozenset(["north"])}
        ).matches(device)

    def test_tags_and_across_keys_partial_match_excluded(self):
        device = _virtual(
            "d1", "Device", tags={"asset_id": "floor1", "region": "south"}
        )
        assert not DeviceFilters(
            tags={"asset_id": frozenset(["floor1"]), "region": frozenset(["north"])}
        ).matches(device)

    def test_tags_or_within_key_values(self):
        filters = DeviceFilters(tags={"asset_id": frozenset(["floor1", "floor2"])})
        assert filters.matches(_virtual("d1", "D1", tags={"asset_id": "floor1"}))
        assert filters.matches(_virtual("d2", "D2", tags={"asset_id": "floor2"}))

    # -- is_faulty --

    @pytest.mark.parametrize(
        ("device_id", "name", "is_faulty_flag"),
        [
            ("faulty", "Faulty", True),
            ("healthy", "Healthy", False),
        ],
    )
    def test_is_faulty_none_matches_all(self, device_id, name, is_faulty_flag):
        attr = _fault_attr("alarm", faulty=is_faulty_flag)
        assert DeviceFilters(is_faulty=None).matches(
            _virtual(device_id, name, attributes={"alarm": attr})
        )

    @staticmethod
    def _faulty_devices() -> tuple[VirtualDevice, VirtualDevice, VirtualDevice]:
        faulty_attr = _fault_attr("alarm", faulty=True)
        healthy_attr = _fault_attr("alarm", faulty=False)
        return (
            _virtual("f", "Faulty", attributes={"alarm": faulty_attr}),
            _virtual("h", "Healthy", attributes={"alarm": healthy_attr}),
            _virtual("p", "Plain"),
        )

    def test_is_faulty_true_matches_faulty_only(self):
        faulty, healthy, plain = self._faulty_devices()
        assert DeviceFilters(is_faulty=True).matches(faulty)
        assert not DeviceFilters(is_faulty=True).matches(healthy)
        assert not DeviceFilters(is_faulty=True).matches(plain)

    def test_is_faulty_false_matches_non_faulty_only(self):
        faulty, healthy, plain = self._faulty_devices()
        assert not DeviceFilters(is_faulty=False).matches(faulty)
        assert DeviceFilters(is_faulty=False).matches(healthy)
        assert DeviceFilters(is_faulty=False).matches(plain)

    # -- search --

    @pytest.mark.parametrize(
        ("query", "expected"),
        [
            pytest.param("chambre", True, id="fuzzy_match"),
            pytest.param("xyz", False, id="no_match"),
            pytest.param("", True, id="empty_str_passthrough"),
            pytest.param(None, True, id="no_filter"),
        ],
    )
    def test_search(self, query, expected):
        device = _virtual("d1", "Chambre 12")
        assert DeviceFilters(search=query).matches(device) is expected

    # -- combinations --

    def test_all_filters_combined_match(self):
        device = _virtual(
            "d1",
            "Chambre 12",
            device_type="thermostat",
            tags={"asset_id": "floor1"},
            attributes=_writable_attrs(),
        )
        assert DeviceFilters(
            ids=frozenset(["d1"]),
            types=frozenset(["thermostat"]),
            writable_attribute="setpoint",
            tags={"asset_id": frozenset(["floor1"])},
            search="chambre",
        ).matches(device)

    def test_all_filters_combined_one_fails(self):
        device = _virtual(
            "d1",
            "Chambre 12",
            device_type="thermostat",
            tags={"asset_id": "floor1"},
            attributes=_writable_attrs(),
        )
        # Everything matches except ids — wrong id
        assert not DeviceFilters(
            ids=frozenset(["d99"]),
            types=frozenset(["thermostat"]),
            writable_attribute="setpoint",
            tags={"asset_id": frozenset(["floor1"])},
            search="chambre",
        ).matches(device)


class TestDeviceFiltersDriverAndTransport:
    """driver_id / transport_id resolve to None on virtual devices, so those
    filters only ever match physical devices."""

    @staticmethod
    def _physical(driver, transport) -> PhysicalDevice:
        return PhysicalDevice.from_base(
            DeviceBase(id="p1", name="Physical", config={}),
            driver=driver,
            transport=transport,
        )

    # -- driver_id (fixture `driver` has id "test_driver") --

    def test_driver_id_match(self, driver, mock_transport_client):
        device = self._physical(driver, mock_transport_client)
        assert DeviceFilters(driver_id="test_driver").matches(device)

    def test_driver_id_no_match(self, driver, mock_transport_client):
        device = self._physical(driver, mock_transport_client)
        assert not DeviceFilters(driver_id="other_driver").matches(device)

    def test_driver_id_none_matches_all(self, driver, mock_transport_client):
        device = self._physical(driver, mock_transport_client)
        assert DeviceFilters(driver_id=None).matches(device)

    def test_driver_id_excludes_virtual_devices(self):
        assert not DeviceFilters(driver_id="test_driver").matches(
            _virtual("v1", "Virtual")
        )

    # -- transport_id (fixture `mock_transport_client` has id "my-transport") --

    def test_transport_id_match(self, driver, mock_transport_client):
        device = self._physical(driver, mock_transport_client)
        assert DeviceFilters(transport_id="my-transport").matches(device)

    def test_transport_id_no_match(self, driver, mock_transport_client):
        device = self._physical(driver, mock_transport_client)
        assert not DeviceFilters(transport_id="other_transport").matches(device)

    def test_transport_id_excludes_virtual_devices(self):
        assert not DeviceFilters(transport_id="my-transport").matches(
            _virtual("v1", "Virtual")
        )
