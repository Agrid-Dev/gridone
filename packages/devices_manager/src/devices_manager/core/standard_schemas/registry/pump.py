from typing import Final

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType

PUMP_KEY: Final = "pump"

# Ordered by how many of the four surveyed sources expose each quantity
# (Grundfos MAGNA3, Wilo Stratos MAXO, Lowara ecocirc XLplus, and the profile
# deployed behind a third-party BMS): the universal field first, then the 100%
# group, then 75%, then 50%.
#
# `onoff_state` is the only required field, and that is the whole design
# decision. The measured trio head/volume_flow/speed also scores 100%, but all
# four sources are smart variable-speed pumps; a building is full of pumps that
# are not. Requiring the hydraulic trio would make every dry-contact
# circulation or booster pump untypable — the failure `awhp` already has.
# Whether it turns is the only thing true of every pump.
#
# Faults and warnings are deliberately absent. A standard schema describes what
# a device *measures*; alarms are orthogonal infrastructure that already works
# on any attribute of any name through `kind: fault`. A pump's fault contact is
# declared by its driver as a fault attribute and surfaces through the generic
# machinery — badge, severity tint, active-fault row, notifications — without
# the type contract having to name it. That also frees each site to map its own
# fault points, whatever they are called and whatever their polarity.
pump_fields = [
    StandardAttributeSchemaField(
        name="onoff_state", data_type=DataType.BOOL, required=True
    ),
    StandardAttributeSchemaField(name="head", data_type=DataType.FLOAT, required=False),
    StandardAttributeSchemaField(
        name="volume_flow", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="speed", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="operating_hours", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="control_mode", data_type=DataType.STRING, required=False
    ),
    StandardAttributeSchemaField(
        name="setpoint", data_type=DataType.FLOAT, required=False
    ),
    # The setpoint actually in force, once external influence (analogue input,
    # bus override, night mode) has acted on the configured `setpoint`.
    StandardAttributeSchemaField(
        name="actual_setpoint", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="power", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="energy", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="motor_current", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="liquid_temperature", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="starts", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="motor_voltage", data_type=DataType.FLOAT, required=False
    ),
]

pump_schema = StandardAttributeSchema(
    key=PUMP_KEY,
    name="Pump",
    fields=pump_fields,
)
