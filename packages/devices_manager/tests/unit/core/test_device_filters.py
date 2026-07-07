from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

import pytest

from devices_manager.core.device import Attribute, CoreDevice, FaultAttribute
from devices_manager.core.device_filters import DeviceFilters
from devices_manager.types import DataType

DeviceFactory = Callable[..., CoreDevice]


@pytest.fixture
def make_device(driver, mock_transport_client) -> DeviceFactory:
    """Build a CoreDevice with hand-picked attributes/type/tags for filtering."""

    def _make(
        device_id: str,
        name: str,
        *,
        device_type: str | None = None,
        tags: dict[str, str] | None = None,
        attributes: dict[str, Attribute] | None = None,
    ) -> CoreDevice:
        if attributes is None:
            attributes = {"x": Attribute.create("x", DataType.FLOAT, {"read"})}
        device = CoreDevice(
            id=device_id,
            name=name,
            attributes=attributes,
            driver=driver,
            transport=mock_transport_client,
            config={},
        )
        device.type = device_type
        if tags:
            device.tags = tags
        return device

    return _make


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

    def test_no_filters_matches_all(self, make_device):
        assert DeviceFilters().matches(make_device("d1", "Device"))

    # -- ids --

    @pytest.mark.parametrize(
        ("filter_ids", "expected"),
        [
            pytest.param(frozenset(["d1"]), True, id="match"),
            pytest.param(frozenset(["d2"]), False, id="no_match"),
            pytest.param(None, True, id="no_filter"),
        ],
    )
    def test_ids(self, make_device, filter_ids, expected):
        assert (
            DeviceFilters(ids=filter_ids).matches(make_device("d1", "Device"))
            is expected
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
    def test_types(self, make_device, filter_types, expected):
        assert (
            DeviceFilters(types=filter_types).matches(
                make_device("d1", "Thermostat", device_type="thermostat")
            )
            is expected
        )

    def test_types_untyped_device_excluded(self, make_device):
        assert not DeviceFilters(types=frozenset(["thermostat"])).matches(
            make_device("d1", "Device", device_type=None)
        )

    # -- writable_attribute --

    def test_writable_attribute_match(self, make_device):
        assert DeviceFilters(writable_attribute="setpoint").matches(
            make_device("d1", "Device", attributes=_writable_attrs())
        )

    def test_writable_attribute_read_only_excluded(self, make_device):
        attrs = {"temp": Attribute.create("temp", DataType.FLOAT, {"read"})}
        assert not DeviceFilters(writable_attribute="temp").matches(
            make_device("d1", "Device", attributes=attrs)
        )

    def test_writable_attribute_missing_excluded(self, make_device):
        assert not DeviceFilters(writable_attribute="nonexistent").matches(
            make_device("d1", "Device")
        )

    def test_writable_attribute_none_matches_all(self, make_device):
        assert DeviceFilters(writable_attribute=None).matches(
            make_device("d1", "Device")
        )

    # -- writable_attribute_type --

    @pytest.mark.parametrize(
        ("attr_type", "expected"),
        [
            pytest.param(DataType.FLOAT, True, id="match"),
            pytest.param(DataType.BOOL, False, id="no_match"),
        ],
    )
    def test_writable_attribute_type(self, make_device, attr_type, expected):
        device = make_device("d1", "Device", attributes=_writable_attrs())
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
    def test_tags(self, make_device, filter_tags, expected):
        device = make_device("d1", "Device", tags={"asset_id": "floor1"})
        assert DeviceFilters(tags=filter_tags).matches(device) is expected

    def test_tags_and_across_keys_all_match(self, make_device):
        device = make_device(
            "d1", "Device", tags={"asset_id": "floor1", "region": "north"}
        )
        assert DeviceFilters(
            tags={"asset_id": frozenset(["floor1"]), "region": frozenset(["north"])}
        ).matches(device)

    def test_tags_and_across_keys_partial_match_excluded(self, make_device):
        device = make_device(
            "d1", "Device", tags={"asset_id": "floor1", "region": "south"}
        )
        assert not DeviceFilters(
            tags={"asset_id": frozenset(["floor1"]), "region": frozenset(["north"])}
        ).matches(device)

    def test_tags_or_within_key_values(self, make_device):
        filters = DeviceFilters(tags={"asset_id": frozenset(["floor1", "floor2"])})
        assert filters.matches(make_device("d1", "D1", tags={"asset_id": "floor1"}))
        assert filters.matches(make_device("d2", "D2", tags={"asset_id": "floor2"}))

    # -- is_faulty --

    @pytest.mark.parametrize(
        ("device_id", "name", "is_faulty_flag"),
        [
            ("faulty", "Faulty", True),
            ("healthy", "Healthy", False),
        ],
    )
    def test_is_faulty_none_matches_all(
        self, make_device, device_id, name, is_faulty_flag
    ):
        attr = _fault_attr("alarm", faulty=is_faulty_flag)
        assert DeviceFilters(is_faulty=None).matches(
            make_device(device_id, name, attributes={"alarm": attr})
        )

    @staticmethod
    def _faulty_devices(
        make_device: DeviceFactory,
    ) -> tuple[CoreDevice, CoreDevice, CoreDevice]:
        faulty_attr = _fault_attr("alarm", faulty=True)
        healthy_attr = _fault_attr("alarm", faulty=False)
        return (
            make_device("f", "Faulty", attributes={"alarm": faulty_attr}),
            make_device("h", "Healthy", attributes={"alarm": healthy_attr}),
            make_device("p", "Plain"),
        )

    def test_is_faulty_true_matches_faulty_only(self, make_device):
        faulty, healthy, plain = self._faulty_devices(make_device)
        assert DeviceFilters(is_faulty=True).matches(faulty)
        assert not DeviceFilters(is_faulty=True).matches(healthy)
        assert not DeviceFilters(is_faulty=True).matches(plain)

    def test_is_faulty_false_matches_non_faulty_only(self, make_device):
        faulty, healthy, plain = self._faulty_devices(make_device)
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
    def test_search(self, make_device, query, expected):
        device = make_device("d1", "Chambre 12")
        assert DeviceFilters(search=query).matches(device) is expected

    # -- combinations --

    def test_all_filters_combined_match(self, make_device):
        device = make_device(
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

    def test_all_filters_combined_one_fails(self, make_device):
        device = make_device(
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
    # -- driver_id (fixture `driver` has id "test_driver") --

    def test_driver_id_match(self, make_device):
        assert DeviceFilters(driver_id="test_driver").matches(make_device("d1", "D1"))

    def test_driver_id_no_match(self, make_device):
        assert not DeviceFilters(driver_id="other_driver").matches(
            make_device("d1", "D1")
        )

    def test_driver_id_none_matches_all(self, make_device):
        assert DeviceFilters(driver_id=None).matches(make_device("d1", "D1"))

    # -- transport_id (fixture `mock_transport_client` has id "my-transport") --

    def test_transport_id_match(self, make_device):
        assert DeviceFilters(transport_id="my-transport").matches(
            make_device("d1", "D1")
        )

    def test_transport_id_no_match(self, make_device):
        assert not DeviceFilters(transport_id="other_transport").matches(
            make_device("d1", "D1")
        )
