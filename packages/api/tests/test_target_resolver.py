from unittest.mock import MagicMock

import pytest

from api.targets import (
    UNTAGGED_GROUP_LABEL,
    CompositeTargetResolver,
    compute_attribute_coverage,
    group_device_ids_by_tag,
    group_devices_by_tag,
)
from devices_manager import DevicesServiceInterface
from devices_manager.core.device import Attribute
from devices_manager.dto.device_dto import Device
from devices_manager.types import DataType
from models.errors import InvalidError
from models.targets import AttributeTarget, DevicesFilter


def _device(
    device_id: str,
    attributes: dict[str, Attribute],
    *,
    device_type: str | None = None,
    tags: dict[str, str] | None = None,
) -> Device:
    return Device(
        id=device_id,
        name=device_id,
        type=device_type,
        tags=tags or {},
        attributes=attributes,
        config={},
        driver_id="drv",
        transport_id="tr",
        is_faulty=False,
    )


_THERMO_1 = _device(
    "t1",
    {
        "temperature": Attribute.create("temperature", DataType.FLOAT, {"read"}),
        "setpoint": Attribute.create("setpoint", DataType.FLOAT, {"read", "write"}),
    },
    device_type="thermostat",
)
_THERMO_2 = _device(
    "t2",
    {"temperature": Attribute.create("temperature", DataType.FLOAT, {"read"})},
    device_type="thermostat",
)
_BOOL_THERMO = _device(
    "t3",
    {"temperature": Attribute.create("temperature", DataType.BOOL, {"read"})},
    device_type="thermostat",
)
_METER = _device(
    "m1",
    {"energy": Attribute.create("energy", DataType.FLOAT, {"read"})},
    device_type="meter",
)


def _make_dm(devices: list[Device]) -> MagicMock:
    dm = MagicMock(spec=DevicesServiceInterface)

    def _list_devices(*, ids=None, types=None, **_kwargs: object) -> list[Device]:
        results = devices
        if ids is not None:
            results = [d for d in results if d.id in set(ids)]
        if types is not None:
            results = [d for d in results if d.type in set(types)]
        return list(results)

    dm.list_devices.side_effect = _list_devices
    return dm


class TestComputeAttributeCoverage:
    def test_counts_devices_and_writables(self):
        coverage = compute_attribute_coverage([_THERMO_1, _THERMO_2, _METER])
        by_name = {c.attribute: c for c in coverage}
        assert by_name["temperature"].device_count == 2
        assert by_name["temperature"].data_types == [DataType.FLOAT]
        assert by_name["setpoint"].writable_count == 1
        assert by_name["energy"].device_count == 1

    def test_mixed_data_types_reported(self):
        coverage = compute_attribute_coverage([_THERMO_1, _BOOL_THERMO])
        by_name = {c.attribute: c for c in coverage}
        assert by_name["temperature"].data_types == [DataType.BOOL, DataType.FLOAT]

    def test_empty(self):
        assert compute_attribute_coverage([]) == []


class TestCompositeTargetResolver:
    @pytest.mark.asyncio
    async def test_resolves_filter_to_device_ids_and_data_type(self):
        resolver = CompositeTargetResolver(_make_dm([_THERMO_1, _THERMO_2, _METER]))
        resolved = await resolver.resolve(
            AttributeTarget(
                devices=DevicesFilter(types=["thermostat"]), attribute="temperature"
            )
        )
        assert resolved.device_ids == ["t1", "t2"]
        assert resolved.data_type == DataType.FLOAT
        assert resolved.excluded_device_ids == []

    @pytest.mark.asyncio
    async def test_reports_exclusions_instead_of_dropping(self):
        resolver = CompositeTargetResolver(_make_dm([_THERMO_1, _METER]))
        resolved = await resolver.resolve(
            AttributeTarget(devices=DevicesFilter(), attribute="temperature")
        )
        assert resolved.device_ids == ["t1"]
        assert resolved.excluded_device_ids == ["m1"]

    @pytest.mark.asyncio
    async def test_writable_excludes_read_only_devices(self):
        resolver = CompositeTargetResolver(_make_dm([_THERMO_1, _THERMO_2]))
        resolved = await resolver.resolve(
            AttributeTarget(devices=DevicesFilter(), attribute="setpoint"),
            writable=True,
        )
        assert resolved.device_ids == ["t1"]
        assert resolved.excluded_device_ids == ["t2"]

    @pytest.mark.asyncio
    async def test_mixed_data_types_raise(self):
        resolver = CompositeTargetResolver(_make_dm([_THERMO_1, _BOOL_THERMO]))
        with pytest.raises(InvalidError, match="Mixed data types"):
            await resolver.resolve(
                AttributeTarget(devices=DevicesFilter(), attribute="temperature")
            )

    @pytest.mark.asyncio
    async def test_no_coverage_raises(self):
        resolver = CompositeTargetResolver(_make_dm([_METER]))
        with pytest.raises(InvalidError, match="No device in the target"):
            await resolver.resolve(
                AttributeTarget(devices=DevicesFilter(), attribute="temperature")
            )

    @pytest.mark.asyncio
    async def test_coverage_uses_devices_filter_only(self):
        dm = _make_dm([_THERMO_1, _METER])
        resolver = CompositeTargetResolver(dm)
        coverage = await resolver.list_attribute_coverage(
            DevicesFilter(types=["thermostat"])
        )
        assert [c.attribute for c in coverage] == ["setpoint", "temperature"]
        dm.list_devices.assert_called_once_with(types=["thermostat"])


class TestResolveWithDevices:
    @pytest.mark.asyncio
    async def test_returns_the_same_resolution_as_resolve(self):
        dm = _make_dm([_THERMO_1, _THERMO_2, _METER])
        resolver = CompositeTargetResolver(dm)
        resolved, devices = await resolver.resolve_with_devices(
            AttributeTarget(
                devices=DevicesFilter(types=["thermostat"]), attribute="temperature"
            )
        )
        assert resolved.device_ids == ["t1", "t2"]
        assert resolved.data_type == DataType.FLOAT
        assert [d.id for d in devices] == ["t1", "t2"]

    @pytest.mark.asyncio
    async def test_only_scans_devices_once(self):
        dm = _make_dm([_THERMO_1, _THERMO_2])
        resolver = CompositeTargetResolver(dm)
        await resolver.resolve_with_devices(
            AttributeTarget(devices=DevicesFilter(), attribute="temperature")
        )
        dm.list_devices.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_coverage_raises(self):
        resolver = CompositeTargetResolver(_make_dm([_METER]))
        with pytest.raises(InvalidError, match="No device in the target"):
            await resolver.resolve_with_devices(
                AttributeTarget(devices=DevicesFilter(), attribute="temperature")
            )


class TestGroupDeviceIdsByTag:
    def test_groups_by_tag_value(self):
        floor1 = _device("t1", {}, tags={"floor": "1"})
        floor1b = _device("t2", {}, tags={"floor": "1"})
        floor2 = _device("t3", {}, tags={"floor": "2"})
        groups = group_device_ids_by_tag([floor1, floor1b, floor2], "floor")
        assert groups == {"1": ["t1", "t2"], "2": ["t3"]}

    def test_devices_without_the_tag_land_in_untagged(self):
        tagged = _device("t1", {}, tags={"floor": "1"})
        untagged = _device("t2", {})
        groups = group_device_ids_by_tag([tagged, untagged], "floor")
        assert groups == {"1": ["t1"], UNTAGGED_GROUP_LABEL: ["t2"]}

    def test_devices_with_a_different_tag_key_are_also_untagged(self):
        device = _device("t1", {}, tags={"zone": "a"})
        groups = group_device_ids_by_tag([device], "floor")
        assert groups == {UNTAGGED_GROUP_LABEL: ["t1"]}

    def test_empty_device_list_yields_no_groups(self):
        assert group_device_ids_by_tag([], "floor") == {}


class TestGroupDevicesByTag:
    def test_groups_by_tag_value(self):
        floor1 = _device("t1", {}, tags={"floor": "1"})
        floor1b = _device("t2", {}, tags={"floor": "1"})
        floor2 = _device("t3", {}, tags={"floor": "2"})
        groups = group_devices_by_tag([floor1, floor1b, floor2], "floor")
        assert groups == {"1": [floor1, floor1b], "2": [floor2]}

    def test_devices_without_the_tag_land_in_untagged(self):
        tagged = _device("t1", {}, tags={"floor": "1"})
        untagged = _device("t2", {})
        groups = group_devices_by_tag([tagged, untagged], "floor")
        assert groups == {"1": [tagged], UNTAGGED_GROUP_LABEL: [untagged]}

    def test_group_device_ids_by_tag_matches_the_ids_of_group_devices_by_tag(self):
        floor1 = _device("t1", {}, tags={"floor": "1"})
        untagged = _device("t2", {})
        devices = [floor1, untagged]
        by_device = group_devices_by_tag(devices, "floor")
        by_id = group_device_ids_by_tag(devices, "floor")
        assert by_id == {
            label: [d.id for d in group] for label, group in by_device.items()
        }
