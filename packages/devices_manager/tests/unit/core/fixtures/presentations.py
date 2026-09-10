"""The thermostat presentation of the UI fixture, and a driver that fits it.

The document is ``tests/unit/core/presentation/fixtures/thermostat_presentation.yaml``,
the same document as ``apps/ui/.../agridThermostat/presentation.ts``. Every
binding names an attribute below, typed as the face expects (booleans for
the locks and flags, floats for the readings, option lists for the selects).
"""

from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
import yaml

from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.core.presentation import PresentationEnvelope
from devices_manager.types import DataType, TransportProtocols

THERMOSTAT_PRESENTATION_PATH = (
    Path(__file__).parent.parent
    / "presentation"
    / "fixtures"
    / "thermostat_presentation.yaml"
)

FACE_PATH = "/page/items/1/content/children/0"
"""JSON pointer of the device-face node of the thermostat document."""
LAYERS_PATH = f"{FACE_PATH}/layers"
SETPOINT_TABLE_PATH = "/page/items/0/content/children/0/children/0"
CONTROL_PANEL_PATH = "/page/items/0/content/children/0/children/1"
MEASUREMENTS_PATH = "/page/items/0/content/children/1/children/0"
FACE_LAYER_COUNT = 35

_DOCUMENT: dict[str, Any] = yaml.safe_load(
    THERMOSTAT_PRESENTATION_PATH.read_text(encoding="utf-8")
)


def load_thermostat_presentation() -> dict[str, Any]:
    """A fresh copy of the document: tests mutate it freely."""
    return deepcopy(_DOCUMENT)


def put(document: Any, pointer: str, value: object) -> None:  # noqa: ANN401
    """Set ``value`` at a JSON pointer (``/page/items/1/content``) in ``document``.

    List indices are decimal segments; the parent must already exist.
    """
    *parents, last = pointer.lstrip("/").split("/")
    target = document
    for part in parents:
        target = target[int(part)] if isinstance(target, list) else target[part]
    if isinstance(target, list):
        target[int(last)] = value
    else:
        target[last] = value


def presentation_attribute(
    name: str,
    data_type: DataType,
    *,
    writable: bool = False,
    options: list[str] | None = None,
) -> AttributeDriver:
    codecs = [] if options is None else [CodecSpec(name="options", argument=options)]
    return AttributeDriver(
        name=name,
        data_type=data_type,
        read=f"GET /{name}",
        write=f"POST /{name}" if writable else None,
        codecs=codecs,
    )


def thermostat_presentation_attributes() -> dict[str, AttributeDriver]:
    """One attribute per binding of the fixture, typed as the face expects."""
    modes = ["heat", "cool", "auto", "fan"]
    attributes = [
        presentation_attribute("onoff_state", DataType.BOOL, writable=True),
        presentation_attribute("mode", DataType.STRING, writable=True, options=modes),
        presentation_attribute("hvac_real_mode", DataType.STRING, options=modes),
        presentation_attribute(
            "fan_speed",
            DataType.STRING,
            writable=True,
            options=["low", "medium", "high", "auto"],
        ),
        presentation_attribute("temperature_setpoint", DataType.FLOAT, writable=True),
        presentation_attribute("temperature_setpoint_effective", DataType.FLOAT),
        presentation_attribute("temperature", DataType.FLOAT),
        presentation_attribute("humidity", DataType.FLOAT),
        presentation_attribute("print_green_leaf", DataType.BOOL),
        presentation_attribute("print_indoor_temperature", DataType.BOOL),
        presentation_attribute("print_humidity", DataType.BOOL),
        presentation_attribute("temperature_setpoint_precision", DataType.FLOAT),
        presentation_attribute("temperature_unit", DataType.STRING, options=["C", "F"]),
        presentation_attribute("state_block", DataType.BOOL),
        presentation_attribute("temperature_setpoint_block", DataType.BOOL),
        presentation_attribute("hvac_mode_block", DataType.BOOL),
        presentation_attribute("fan_speed_block", DataType.BOOL),
        presentation_attribute("app_version", DataType.STRING),
        presentation_attribute("reboot_timestamp", DataType.INT),
    ]
    return {attribute.name: attribute for attribute in attributes}


def thermostat_presentation_driver(
    driver_id: str = "thermostat_presented",
    presentation: dict[str, Any] | None = None,
) -> Driver:
    """A driver carrying the thermostat presentation (or ``presentation``)."""
    document = load_thermostat_presentation() if presentation is None else presentation
    return Driver(
        metadata=DriverMetadata(id=driver_id),
        transport=TransportProtocols.HTTP,
        env={},
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes=thermostat_presentation_attributes(),
        presentation=PresentationEnvelope.model_validate(document),
    )


@pytest.fixture
def thermostat_document() -> dict[str, Any]:
    return load_thermostat_presentation()


@pytest.fixture
def thermostat_attributes() -> dict[str, AttributeDriver]:
    return thermostat_presentation_attributes()


@pytest.fixture
def thermostat_envelope(thermostat_document: dict[str, Any]) -> PresentationEnvelope:
    return PresentationEnvelope.model_validate(thermostat_document)


@pytest.fixture
def presented_driver() -> Driver:
    return thermostat_presentation_driver()
