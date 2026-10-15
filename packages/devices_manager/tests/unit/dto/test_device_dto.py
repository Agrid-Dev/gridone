from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from devices_manager.core.device import (
    Attribute,
    CoreDevice,
    FaultAttribute,
)
from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.driver.revision import get_driver_revision
from devices_manager.dto.device_dto import (
    AttributeSelection,
    Device,
    DeviceCreate,
    DriverRevisions,
    core_to_dto,
    dto_to_core,
    revision_per_driver,
)
from devices_manager.dto.presentation_dto import PresentationReference
from devices_manager.types import DataType
from models.attribute_metadata import LocalizedText, ValueLabel, WriteConstraints
from models.types import Severity
from models.write_rules import AttributeWriteState

# Patched where the DTO module looks it up, at call time.
_HASH = "devices_manager.dto.device_dto.get_presentation_revision"


@pytest.fixture
def make_device(driver, mock_transport_client):
    """Build a CoreDevice carrying hand-picked runtime attributes."""

    def _make(
        device_id: str, name: str, attributes: dict[str, Attribute]
    ) -> CoreDevice:
        return CoreDevice(
            id=device_id,
            name=name,
            attributes=attributes,
            driver=driver,
            transport=mock_transport_client,
            config={},
        )

    return _make


class TestDeviceCreate:
    def test_parse(self):
        payload = {
            "name": "Thermostat",
            "config": {"ip": "192.168.1.10"},
            "driver_id": "thermostat-http",
            "transport_id": "t1",
        }
        dto = DeviceCreate.model_validate(payload)
        assert dto.driver_id == "thermostat-http"
        assert dto.transport_id == "t1"

    def test_missing_driver_id_rejected(self):
        with pytest.raises(ValidationError):
            DeviceCreate.model_validate(
                {
                    "name": "Thermostat",
                    "config": {},
                    "transport_id": "t1",
                }
            )

    def test_missing_transport_id_rejected(self):
        with pytest.raises(ValidationError):
            DeviceCreate.model_validate(
                {
                    "name": "Thermostat",
                    "config": {},
                    "driver_id": "d1",
                }
            )


class TestCoreDeviceToDto:
    """Validate that core_to_dto rolls `is_faulty` up onto the Device DTO."""

    _NOW = datetime(2026, 1, 1, tzinfo=UTC)

    def _fault_attr(self, *, faulty: bool) -> FaultAttribute:
        return FaultAttribute(
            name="alarm",
            data_type=DataType.STRING,
            read_write_modes={"read"},
            current_value="error" if faulty else "ok",
            healthy_values=["ok"],
            last_updated=self._NOW,
            last_changed=self._NOW,
        )

    def test_is_faulty_true_when_any_attribute_is_faulty(self, make_device):
        device = make_device("d1", "D1", {"alarm": self._fault_attr(faulty=True)})
        assert core_to_dto(device).is_faulty is True

    def test_is_faulty_false_when_all_fault_attrs_healthy(self, make_device):
        device = make_device("d2", "D2", {"alarm": self._fault_attr(faulty=False)})
        assert core_to_dto(device).is_faulty is False

    def test_is_faulty_false_when_no_fault_attribute(self, make_device):
        device = make_device(
            "d3",
            "D3",
            {
                "reading": Attribute.create(
                    "reading", DataType.FLOAT, {"read"}, value=20.0
                ),
            },
        )
        assert core_to_dto(device).is_faulty is False


class TestDtoToCoreRestoresTimestamps:
    """Regression AGR-887: loading a device from storage must resume each
    attribute's last_updated/last_changed, not reset them to load time."""

    _OLD = datetime(2020, 1, 1, tzinfo=UTC)

    def test_restores_persisted_timestamps(self, driver, mock_transport_client):
        dto = Device(
            id="d1",
            name="D1",
            config={},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
            attributes={
                "temperature": Attribute(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    read_write_modes={"read"},
                    current_value=21.0,
                    last_updated=self._OLD,
                    last_changed=self._OLD,
                )
            },
        )
        device = dto_to_core(
            dto, {driver.id: driver}, {mock_transport_client.id: mock_transport_client}
        )
        restored = device.attributes["temperature"]
        assert restored.current_value == 21.0
        assert restored.last_updated == self._OLD
        assert restored.last_changed == self._OLD

    def test_fresh_attribute_with_no_stored_value_is_not_backdated(
        self, driver, mock_transport_client
    ):
        dto = Device(
            id="d1",
            name="D1",
            config={},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
            attributes={},
        )
        device = dto_to_core(
            dto, {driver.id: driver}, {mock_transport_client.id: mock_transport_client}
        )
        assert device.attributes["temperature"].current_value is None
        assert device.attributes["temperature"].last_updated is None
        assert device.attributes["temperature"].last_changed is None


class TestMetadataRoundTrip:
    """created_at/updated_at must survive dto -> core -> dto."""

    _CREATED = datetime(2020, 1, 1, tzinfo=UTC)
    _UPDATED = datetime(2021, 1, 1, tzinfo=UTC)

    def test_dto_to_core_to_dto_preserves_timestamps(
        self, driver, mock_transport_client
    ):
        dto = Device(
            id="d1",
            name="D1",
            config={},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
            created_at=self._CREATED,
            updated_at=self._UPDATED,
        )
        device = dto_to_core(
            dto, {driver.id: driver}, {mock_transport_client.id: mock_transport_client}
        )
        assert device.created_at == self._CREATED
        assert device.updated_at == self._UPDATED

        rebuilt = core_to_dto(device)
        assert rebuilt.created_at == self._CREATED
        assert rebuilt.updated_at == self._UPDATED

    def test_fresh_device_defaults_both_timestamps(self, make_device):
        device = make_device("d2", "D2", {})
        dto = core_to_dto(device)
        assert dto.created_at == device.created_at
        assert dto.updated_at == device.updated_at


class TestDeviceAttributeSerialization:
    """`Device.attributes` uses a discriminated union keyed on `kind`: standard
    attributes serialize the base `Attribute` schema (no severity / healthy_values
    leak), fault attributes serialize the `FaultAttribute` schema with `kind`
    on the wire, and JSON payloads round-trip back to the right subclass."""

    _NOW = datetime(2026, 1, 1, tzinfo=UTC)

    def _fault_payload(self) -> dict:
        return {
            "id": "d1",
            "name": "D1",
            "config": {},
            "driver_id": "drv",
            "transport_id": "tr",
            "is_faulty": True,
            "attributes": {
                "fault_code": {
                    "kind": "fault",
                    "name": "fault_code",
                    "data_type": "int",
                    "read_write_modes": ["read"],
                    "current_value": 3,
                    "healthy_values": [0],
                    "last_updated": self._NOW.isoformat(),
                    "last_changed": self._NOW.isoformat(),
                }
            },
        }

    def test_fault_attribute_fields_round_trip_through_device_json(self, make_device):
        fault = FaultAttribute(
            name="fault_code",
            data_type=DataType.INT,
            read_write_modes={"read"},
            current_value=3,
            healthy_values=[0],
            last_updated=self._NOW,
            last_changed=self._NOW,
        )
        device = make_device("d1", "D1", {"fault_code": fault})
        dto = core_to_dto(device)

        payload = json.loads(dto.model_dump_json())
        attr_payload = payload["attributes"]["fault_code"]

        assert attr_payload["kind"] == "fault"
        assert attr_payload["severity"] == "warning"
        assert attr_payload["is_faulty"] is True
        assert attr_payload["healthy_values"] == [0]
        assert attr_payload["last_changed"] == self._NOW.isoformat().replace(
            "+00:00", "Z"
        )

    def test_standard_attribute_omits_fault_only_fields(self, make_device):
        device = make_device(
            "d2",
            "D2",
            {
                "reading": Attribute.create(
                    "reading", DataType.FLOAT, {"read"}, value=20.0
                ),
            },
        )
        dto = core_to_dto(device)

        payload = json.loads(dto.model_dump_json())
        attr_payload = payload["attributes"]["reading"]

        assert attr_payload["kind"] == "standard"
        assert "severity" not in attr_payload
        assert "is_faulty" not in attr_payload
        assert "healthy_values" not in attr_payload

    def test_device_parses_fault_attribute_from_json(self):
        device = Device.model_validate(self._fault_payload())
        attr = device.attributes["fault_code"]
        assert isinstance(attr, FaultAttribute)
        assert attr.kind == AttributeKind.FAULT
        assert attr.severity == Severity.WARNING
        assert attr.is_faulty is True
        assert attr.healthy_values == [0]

    def test_device_defaults_is_faulty_when_absent(self):
        """`is_faulty` is derived, so a stored/authored device payload need
        not carry it — it defaults to False (recomputed on first sync)."""
        device = Device.model_validate(
            {
                "id": "d5",
                "name": "D5",
                "driver_id": "drv",
                "transport_id": "tr",
                "config": {"device_instance": 1},
            }
        )
        assert device.is_faulty is False

    def test_device_requires_driver_and_transport(self):
        with pytest.raises(ValidationError):
            Device.model_validate({"id": "d6", "name": "D6", "config": {}})

    def test_device_parses_standard_attribute_without_kind(self):
        payload = {
            "id": "d3",
            "name": "D3",
            "config": {},
            "driver_id": "drv",
            "transport_id": "tr",
            "is_faulty": False,
            "attributes": {
                "reading": {
                    "name": "reading",
                    "data_type": "float",
                    "read_write_modes": ["read"],
                    "current_value": 20.0,
                }
            },
        }
        device = Device.model_validate(payload)
        attr = device.attributes["reading"]
        assert isinstance(attr, Attribute)
        assert not isinstance(attr, FaultAttribute)
        assert attr.kind == AttributeKind.STANDARD

    def test_internal_attribute_serializes_with_kind(self, make_device):
        internal = Attribute(
            name="connection_status",
            kind=AttributeKind.INTERNAL,
            data_type=DataType.STRING,
            read_write_modes={"read"},
            current_value="ok",
        )
        device = make_device("d4", "D4", {"connection_status": internal})
        dto = core_to_dto(device)
        payload = json.loads(dto.model_dump_json())
        attr_payload = payload["attributes"]["connection_status"]

        assert attr_payload["kind"] == "internal"
        assert attr_payload["current_value"] == "ok"
        assert "severity" not in attr_payload
        assert "is_faulty" not in attr_payload

    def test_internal_attribute_parses_from_json(self):
        payload = {
            "id": "d5",
            "name": "D5",
            "config": {},
            "driver_id": "drv",
            "transport_id": "tr",
            "is_faulty": False,
            "attributes": {
                "connection_status": {
                    "kind": "internal",
                    "name": "connection_status",
                    "data_type": "str",
                    "read_write_modes": ["read"],
                    "current_value": "degraded",
                }
            },
        }
        device = Device.model_validate(payload)
        attr = device.attributes["connection_status"]
        assert isinstance(attr, Attribute)
        assert attr.kind == AttributeKind.INTERNAL
        assert attr.current_value == "degraded"


# What a selection drops from every attribute it keeps.
_OMITTED = (
    "write_constraints",
    "write_state",
    "description",
    "user_confirmation",
    "default_value",
)
_NOW = datetime(2026, 1, 1, tzinfo=UTC)
_CONSTRAINTS = WriteConstraints(minimum=5, maximum=30, step=0.5)


def _rich_attribute(
    name: str, data_type: DataType, value: object, **fields: object
) -> Attribute:
    """An attribute carrying the fields a selection keeps and the ones it drops."""
    return Attribute.model_validate(
        {
            "name": name,
            "data_type": data_type,
            "read_write_modes": {"read", "write"},
            "current_value": value,
            "last_updated": _NOW,
            "last_changed": _NOW,
            "label": LocalizedText(default=f"{name} label"),
            "description": LocalizedText(default=f"What {name} is"),
            "user_confirmation": LocalizedText(default=f"Change {name}?"),
            "write_state": AttributeWriteState(status="ready"),
            **fields,
        }
    )


def _fault(name: str, value: str) -> FaultAttribute:
    return FaultAttribute(
        name=name,
        data_type=DataType.STRING,
        read_write_modes={"read"},
        current_value=value,
        healthy_values=["ok"],
        severity=Severity.ALERT,
        last_updated=_NOW,
        last_changed=_NOW,
        description=LocalizedText(default=f"What {name} means"),
    )


@pytest.fixture
def rich_device(driver, mock_transport_client) -> CoreDevice:
    """A device with standard, internal and fault attributes, one fault active.

    ``temperature_setpoint`` is also a driver attribute, so its write state is
    the guard's projection, as in production.
    """
    attributes: dict[str, Attribute] = {
        "temperature_setpoint": _rich_attribute(
            "temperature_setpoint",
            DataType.FLOAT,
            21.0,
            unit="°C",
            write_constraints=_CONSTRAINTS,
            default_value=20.0,
        ),
        "onoff_state": _rich_attribute(
            "onoff_state",
            DataType.BOOL,
            value=True,
            value_labels=[
                ValueLabel(value=False, label=LocalizedText(default="Off")),
                ValueLabel(value=True, label=LocalizedText(default="On")),
            ],
            default_value=False,
        ),
        "mode": _rich_attribute(
            "mode",
            DataType.STRING,
            "heat",
            value_options=["heat", "cool"],
            default_value="heat",
        ),
        "connection_status": Attribute(
            name="connection_status",
            kind=AttributeKind.INTERNAL,
            data_type=DataType.STRING,
            read_write_modes={"read"},
            current_value="ok",
        ),
        "alarm": _fault("alarm", "error"),
        "filter_alarm": _fault("filter_alarm", "ok"),
    }
    return CoreDevice(
        id="d1",
        name="D1",
        attributes=attributes,
        driver=driver,
        transport=mock_transport_client,
        config={},
    )


class TestAttributeSelection:
    """A listing's selection keeps the named attributes and every attribute of
    the selected kinds, each without its write contract or texts."""

    @pytest.mark.parametrize(
        ("selection", "expected"),
        [
            pytest.param(
                AttributeSelection(names=frozenset({"temperature_setpoint", "mode"})),
                {"temperature_setpoint", "mode"},
                id="names",
            ),
            pytest.param(
                AttributeSelection(kinds=frozenset({AttributeKind.FAULT})),
                {"alarm", "filter_alarm"},
                id="fault-kind",
            ),
            pytest.param(
                AttributeSelection(kinds=frozenset({AttributeKind.INTERNAL})),
                {"connection_status"},
                id="internal-kind",
            ),
            pytest.param(
                AttributeSelection(kinds=frozenset({AttributeKind.STANDARD})),
                {"temperature_setpoint", "onoff_state", "mode"},
                id="standard-kind",
            ),
            pytest.param(
                AttributeSelection(
                    names=frozenset({"mode"}),
                    kinds=frozenset({AttributeKind.FAULT}),
                ),
                {"mode", "alarm", "filter_alarm"},
                id="names-and-kinds",
            ),
            pytest.param(
                AttributeSelection(names=frozenset({"humidity"})),
                set(),
                id="name-the-device-lacks",
            ),
            pytest.param(AttributeSelection(), set(), id="empty"),
        ],
    )
    def test_keeps_the_named_attributes_and_the_selected_kinds(
        self, rich_device, selection, expected
    ):
        dto = core_to_dto(rich_device, attribute_selection=selection)

        assert set(dto.attributes) == expected

    def test_without_a_selection_every_attribute_comes_whole(self, rich_device):
        dto = core_to_dto(rich_device)

        assert set(dto.attributes) == set(rich_device.attributes)
        setpoint = dto.attributes["temperature_setpoint"]
        assert all(getattr(setpoint, field) is not None for field in _OMITTED)

    def test_a_kept_attribute_loses_its_write_contract_and_texts_only(
        self, rich_device
    ):
        everything = AttributeSelection(names=frozenset(rich_device.attributes))

        dto = core_to_dto(rich_device, attribute_selection=everything)

        # Not vacuous: the live setpoint carries all five, write state included.
        live_setpoint = rich_device.attributes["temperature_setpoint"]
        assert all(getattr(live_setpoint, field) is not None for field in _OMITTED)
        for name, kept in dto.attributes.items():
            live = rich_device.attributes[name]
            assert all(getattr(kept, field) is None for field in _OMITTED), name
            # Value, timestamps, kind, type, unit, label, value labels and
            # options, severity: everything else is the live attribute's.
            assert kept.model_dump(exclude=set(_OMITTED)) == live.model_dump(
                exclude=set(_OMITTED)
            ), name
        assert dto.attributes["onoff_state"].value_labels is not None
        alarm = dto.attributes["alarm"]
        assert isinstance(alarm, FaultAttribute)
        assert alarm.is_faulty is True

    def test_the_wire_shape_has_no_write_contract_or_texts(self, rich_device):
        dto = core_to_dto(
            rich_device,
            attribute_selection=AttributeSelection(
                names=frozenset({"temperature_setpoint"})
            ),
        )

        # The API serves devices with exclude_none: unset fields are absent.
        payload = json.loads(dto.model_dump_json(exclude_none=True))["attributes"]
        assert set(payload) == {"temperature_setpoint"}
        setpoint = payload["temperature_setpoint"]
        assert set(_OMITTED).isdisjoint(setpoint)
        assert setpoint["current_value"] == 21.0
        assert setpoint["unit"] == "°C"
        assert setpoint["label"] == {
            "default": "temperature_setpoint label",
            "translations": {},
        }

    def test_the_live_device_keeps_its_full_attributes(self, rich_device):
        # Project once up front so the snapshot is what the listing projects.
        rich_device.project_write_states()
        before = {name: a.model_dump() for name, a in rich_device.attributes.items()}

        dto = core_to_dto(
            rich_device,
            attribute_selection=AttributeSelection(
                names=frozenset(rich_device.attributes)
            ),
        )

        after = {name: a.model_dump() for name, a in rich_device.attributes.items()}
        assert after == before
        assert all(
            dto.attributes[name] is not rich_device.attributes[name]
            for name in dto.attributes
        )
        # The next full read (a device page) still serves the write contract.
        full = core_to_dto(rich_device).attributes["temperature_setpoint"]
        assert full.write_constraints == _CONSTRAINTS
        assert full.write_state is not None
        assert full.description is not None

    @pytest.mark.parametrize(
        "selection",
        [
            pytest.param(AttributeSelection(), id="empty"),
            pytest.param(AttributeSelection(names=frozenset({"mode"})), id="no-fault"),
        ],
    )
    def test_is_faulty_reads_the_faults_a_selection_leaves_out(
        self, rich_device, selection
    ):
        dto = core_to_dto(rich_device, attribute_selection=selection)

        assert not any(a.kind == AttributeKind.FAULT for a in dto.attributes.values())
        assert dto.is_faulty is True

    def test_restrict_trims_a_public_device_and_leaves_it_whole(self, rich_device):
        full = core_to_dto(rich_device)

        trimmed = AttributeSelection(names=frozenset({"mode"})).restrict(full)

        assert set(trimmed.attributes) == {"mode"}
        assert trimmed.attributes["mode"].write_state is None
        assert trimmed.attributes["mode"].current_value == "heat"
        assert trimmed.model_dump(exclude={"attributes"}) == full.model_dump(
            exclude={"attributes"}
        )
        assert set(full.attributes) == set(rich_device.attributes)
        assert full.attributes["mode"].write_state is not None


class TestDriverRevisions:
    """A listing hashes each driver once; ``core_to_dto`` takes its lookup."""

    def test_core_to_dto_uses_the_given_lookup(self, rich_device):
        lookup = MagicMock(
            return_value=DriverRevisions(
                driver="drv-listing", presentation="rev-listing"
            )
        )

        with patch(_HASH, side_effect=AssertionError("hashed despite a lookup")):
            dto = core_to_dto(rich_device, revisions_of=lookup)

        lookup.assert_called_once_with(rich_device.driver)
        assert dto.driver_revision == "drv-listing"
        assert dto.presentation_ref == PresentationReference(revision="rev-listing")

    def test_a_lookup_without_presentation_leaves_no_reference(self, rich_device):
        dto = core_to_dto(
            rich_device,
            revisions_of=lambda _driver: DriverRevisions(
                driver="drv", presentation=None
            ),
        )

        assert dto.presentation_ref is None
        assert dto.driver_revision == "drv"

    def test_without_a_lookup_core_to_dto_hashes_the_driver(self, rich_device):
        with patch(_HASH, return_value="rev-direct") as hashed:
            dto = core_to_dto(rich_device)

        hashed.assert_called_once_with(rich_device.driver)
        assert dto.presentation_ref == PresentationReference(revision="rev-direct")
        assert dto.driver_revision == get_driver_revision(rich_device.driver)

    def test_devices_of_one_driver_share_the_driver_revision(self, make_device, driver):
        first = core_to_dto(make_device("a", "A", {}))
        second = core_to_dto(make_device("b", "B", {}))

        assert first.driver_revision == second.driver_revision
        assert first.driver_revision == get_driver_revision(driver)

    def test_revision_per_driver_hashes_each_driver_once(
        self, driver, thermostat_driver
    ):
        with patch(_HASH, side_effect=lambda d: f"rev-{d.id}") as hashed:
            revisions_of = revision_per_driver()
            revisions = [
                revisions_of(d).presentation
                for d in (driver, thermostat_driver, driver, thermostat_driver, driver)
            ]

        assert revisions == [
            "rev-test_driver",
            "rev-thermostat_driver",
            "rev-test_driver",
            "rev-thermostat_driver",
            "rev-test_driver",
        ]
        assert hashed.call_count == 2

    def test_revision_per_driver_remembers_a_driver_without_presentation(self, driver):
        with patch(_HASH, return_value=None) as hashed:
            revisions_of = revision_per_driver()
            assert revisions_of(driver).presentation is None
            assert revisions_of(driver).presentation is None

        hashed.assert_called_once_with(driver)

    def test_each_lookup_hashes_afresh(self, driver):
        # One lookup per listing: a driver edited between two listings is
        # hashed again by the next one.
        with patch(_HASH, side_effect=["rev-before-edit", "rev-after-edit"]):
            first = revision_per_driver()(driver).presentation
            second = revision_per_driver()(driver).presentation

        assert (first, second) == ("rev-before-edit", "rev-after-edit")
