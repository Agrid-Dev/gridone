from collections.abc import Callable
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
from devices_manager.dto import AttributeLabels, DevicesQuery, DriverLabels
from devices_manager.dto.device_dto import Device
from devices_manager.types import DataType
from models.attribute_metadata import LocalizedText, ValueLabel, WriteConstraints
from models.errors import InvalidError
from models.targets import AttributeTarget, DevicesFilter

_NO_LABELS = DriverLabels(revision="rev")


def _device(
    device_id: str,
    attributes: dict[str, Attribute],
    *,
    device_type: str | None = None,
    tags: dict[str, list[str]] | None = None,
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

    def _list_devices(
        query: DevicesQuery | None = None, **_kwargs: object
    ) -> list[Device]:
        query = query or DevicesQuery()
        results = devices
        if query.ids is not None:
            results = [d for d in results if d.id in set(query.ids)]
        if query.types is not None:
            results = [d for d in results if d.type in set(query.types)]
        return list(results)

    dm.list_devices.side_effect = _list_devices
    dm.get_driver_labels.return_value = _NO_LABELS
    return dm


class TestComputeAttributeCoverage:
    def test_counts_devices_and_writables(self):
        coverage = compute_attribute_coverage(
            [_THERMO_1, _THERMO_2, _METER], _labels_of()
        )
        by_name = {c.attribute: c for c in coverage}
        assert by_name["temperature"].device_count == 2
        assert by_name["temperature"].data_types == [DataType.FLOAT]
        assert by_name["setpoint"].writable_count == 1
        assert by_name["energy"].device_count == 1

    def test_mixed_data_types_reported(self):
        coverage = compute_attribute_coverage([_THERMO_1, _BOOL_THERMO], _labels_of())
        by_name = {c.attribute: c for c in coverage}
        assert by_name["temperature"].data_types == [DataType.BOOL, DataType.FLOAT]

    def test_empty(self):
        assert compute_attribute_coverage([], _labels_of()) == []


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
        dm.list_devices.assert_called_once_with(DevicesQuery(types=["thermostat"]))


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
        floor1 = _device("t1", {}, tags={"floor": ["1"]})
        floor1b = _device("t2", {}, tags={"floor": ["1"]})
        floor2 = _device("t3", {}, tags={"floor": ["2"]})
        groups = group_device_ids_by_tag([floor1, floor1b, floor2], "floor")
        assert groups == {"1": ["t1", "t2"], "2": ["t3"]}

    def test_devices_without_the_tag_land_in_untagged(self):
        tagged = _device("t1", {}, tags={"floor": ["1"]})
        untagged = _device("t2", {})
        groups = group_device_ids_by_tag([tagged, untagged], "floor")
        assert groups == {"1": ["t1"], UNTAGGED_GROUP_LABEL: ["t2"]}

    def test_devices_with_a_different_tag_key_are_also_untagged(self):
        device = _device("t1", {}, tags={"zone": ["a"]})
        groups = group_device_ids_by_tag([device], "floor")
        assert groups == {UNTAGGED_GROUP_LABEL: ["t1"]}

    def test_empty_device_list_yields_no_groups(self):
        assert group_device_ids_by_tag([], "floor") == {}


class TestGroupDevicesByTag:
    def test_groups_by_tag_value(self):
        floor1 = _device("t1", {}, tags={"floor": ["1"]})
        floor1b = _device("t2", {}, tags={"floor": ["1"]})
        floor2 = _device("t3", {}, tags={"floor": ["2"]})
        groups = group_devices_by_tag([floor1, floor1b, floor2], "floor")
        assert groups == {"1": [floor1, floor1b], "2": [floor2]}

    def test_devices_without_the_tag_land_in_untagged(self):
        tagged = _device("t1", {}, tags={"floor": ["1"]})
        untagged = _device("t2", {})
        groups = group_devices_by_tag([tagged, untagged], "floor")
        assert groups == {"1": [tagged], UNTAGGED_GROUP_LABEL: [untagged]}

    def test_group_device_ids_by_tag_matches_the_ids_of_group_devices_by_tag(self):
        floor1 = _device("t1", {}, tags={"floor": ["1"]})
        untagged = _device("t2", {})
        devices = [floor1, untagged]
        by_device = group_devices_by_tag(devices, "floor")
        by_id = group_device_ids_by_tag(devices, "floor")
        assert by_id == {
            label: [d.id for d in group] for label, group in by_device.items()
        }


def _coverage_device(attribute: Attribute | None, driver_id: str = "drv") -> Device:
    return _device(
        "device", {attribute.name: attribute} if attribute else {}
    ).model_copy(update={"driver_id": driver_id})


def attribute(**overrides: object) -> Attribute:
    return Attribute.create(
        "setpoint",
        DataType.FLOAT,
        {"read", "write"},
        unit="°C",
        value_options=[19, 20, 21],
        write_constraints=WriteConstraints(minimum=19, maximum=21, step=0.5),
    ).model_copy(update=overrides)


_SETPOINT_LABEL = LocalizedText(default="Setpoint", translations={"fr": "Consigne"})
_SETPOINT_LABELS = DriverLabels(
    revision="rev", attributes={"setpoint": AttributeLabels(label=_SETPOINT_LABEL)}
)


def _labels_of(**documents: DriverLabels) -> Callable[[str], DriverLabels]:
    """A labels lookup serving ``documents`` by driver id, an empty document
    for any other driver."""
    return lambda driver_id: documents.get(driver_id, _NO_LABELS)


_VALUE_LABELS = [
    ValueLabel(value=False, label=LocalizedText(default="Stopped")),
    ValueLabel(value=True, label=LocalizedText(default="Running")),
]


def bool_attribute(value_labels: list[ValueLabel] | None = _VALUE_LABELS) -> Attribute:
    return Attribute.create("running", DataType.BOOL, {"read", "write"}).model_copy(
        update={"value_labels": value_labels}
    )


def test_metadata_agrees_and_absent_attribute_does_not_veto():
    first = attribute()
    (row,) = compute_attribute_coverage(
        [
            _coverage_device(first),
            _coverage_device(attribute()),
            _coverage_device(None),
        ],
        _labels_of(drv=_SETPOINT_LABELS),
    )
    assert row.label == _SETPOINT_LABEL
    assert row.unit == "°C"
    assert row.value_options == [19, 20, 21]
    assert row.write_constraints == first.write_constraints
    assert row.device_count == row.writable_count == 2


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("unit", "°F"),
        ("value_options", [19, 20]),
        ("value_options", [21, 20, 19]),
        ("value_options", []),
        ("write_constraints", WriteConstraints(minimum=18)),
        ("unit", None),
        ("value_options", None),
        ("write_constraints", None),
    ],
)
def test_disagreement_or_missing_metadata_is_null(field, value):
    (row,) = compute_attribute_coverage(
        [_coverage_device(attribute()), _coverage_device(attribute(**{field: value}))],
        _labels_of(),
    )
    assert getattr(row, field) is None
    assert row.device_count == 2


def test_label_is_the_drivers_read_once_per_driver():
    """Device attributes carry no label (ADR 0008): the row's label is unified
    over the drivers of the presenting devices, each document read once."""
    documents = MagicMock(
        side_effect=_labels_of(a=_SETPOINT_LABELS, b=_SETPOINT_LABELS)
    )
    (row,) = compute_attribute_coverage(
        [
            _coverage_device(attribute(), driver_id="a"),
            _coverage_device(attribute(), driver_id="a"),
            _coverage_device(attribute(), driver_id="b"),
        ],
        documents,
    )
    assert row.label == _SETPOINT_LABEL
    assert sorted(call.args[0] for call in documents.call_args_list) == ["a", "b"]


@pytest.mark.parametrize(
    "other",
    [
        pytest.param(
            DriverLabels(
                revision="rev",
                attributes={
                    "setpoint": AttributeLabels(label=LocalizedText(default="Target"))
                },
            ),
            id="disagrees",
        ),
        pytest.param(_NO_LABELS, id="declares-none"),
    ],
)
def test_label_is_null_when_the_drivers_disagree_or_one_declares_none(other):
    (row,) = compute_attribute_coverage(
        [
            _coverage_device(attribute(), driver_id="a"),
            _coverage_device(attribute(), driver_id="b"),
        ],
        _labels_of(a=_SETPOINT_LABELS, b=other),
    )
    assert row.label is None
    assert row.device_count == 2


def test_all_metadata_absent():
    (row,) = compute_attribute_coverage(
        [_coverage_device(Attribute.create("value", DataType.FLOAT, {"read"}))],
        _labels_of(),
    )
    assert row.label is row.unit is row.value_options is row.write_constraints is None
    assert row.value_labels is None
    assert row.writable_count == 0


def test_value_labels_kept_when_devices_agree():
    (row,) = compute_attribute_coverage(
        [_coverage_device(bool_attribute()), _coverage_device(bool_attribute())],
        _labels_of(),
    )
    assert row.value_labels == _VALUE_LABELS


@pytest.mark.parametrize(
    "other",
    [
        [
            ValueLabel(value=False, label=LocalizedText(default="Off")),
            ValueLabel(value=True, label=LocalizedText(default="On")),
        ],
        None,
    ],
)
def test_value_labels_null_on_disagreement_or_missing(other):
    (row,) = compute_attribute_coverage(
        [_coverage_device(bool_attribute()), _coverage_device(bool_attribute(other))],
        _labels_of(),
    )
    assert row.value_labels is None


def test_read_only_devices_count_in_exposure_but_do_not_veto_presentation():
    read_only = attribute(unit="°F").model_copy(update={"read_write_modes": {"read"}})
    (row,) = compute_attribute_coverage(
        [_coverage_device(attribute()), _coverage_device(read_only, driver_id="other")],
        _labels_of(drv=_SETPOINT_LABELS),
    )
    assert row.device_count == 2
    assert row.writable_count == 1
    assert row.unit == "°C"
    assert row.label == _SETPOINT_LABEL


def test_presentation_falls_back_to_exposing_devices_when_none_is_writable():
    read_only = attribute().model_copy(update={"read_write_modes": {"read"}})
    (row,) = compute_attribute_coverage(
        [_coverage_device(read_only), _coverage_device(read_only)],
        _labels_of(drv=_SETPOINT_LABELS),
    )
    assert row.writable_count == 0
    assert row.unit == "°C"
    assert row.label == _SETPOINT_LABEL


def test_writable_devices_still_veto_each_other():
    (row,) = compute_attribute_coverage(
        [
            _coverage_device(attribute()),
            _coverage_device(attribute(unit="°F")),
            _coverage_device(
                attribute(unit="K").model_copy(update={"read_write_modes": {"read"}})
            ),
        ],
        _labels_of(),
    )
    assert row.device_count == 3
    assert row.writable_count == 2
    assert row.unit is None
