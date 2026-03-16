from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType

awhp_fields = [
    StandardAttributeSchemaField(
        name="enabled", data_type=DataType.BOOL, required=True
    ),
    StandardAttributeSchemaField(
        name="unit_run_status", data_type=DataType.STRING, required=True
    ),
    StandardAttributeSchemaField(name="mode", data_type=DataType.STRING, required=True),
    StandardAttributeSchemaField(
        name="inlet_temperature", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="outlet_temperature", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="control_point", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="outdoor_temperature", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="compressor_suction_temperature",
        data_type=DataType.FLOAT,
        required=False,
        multiple=True,
    ),
    StandardAttributeSchemaField(
        name="compressor_suction_pressure",
        data_type=DataType.FLOAT,
        required=False,
        multiple=True,
    ),
    StandardAttributeSchemaField(
        name="compressor_discharge_temperature",
        data_type=DataType.FLOAT,
        required=False,
        multiple=True,
    ),
    StandardAttributeSchemaField(
        name="compressor_discharge_pressure",
        data_type=DataType.FLOAT,
        required=False,
        multiple=True,
    ),
    StandardAttributeSchemaField(
        name="condenser_saturated_refrigerant_temperature",
        data_type=DataType.FLOAT,
        required=False,
        multiple=True,
    ),
    StandardAttributeSchemaField(
        name="condenser_refrigerant_pressure",
        data_type=DataType.FLOAT,
        required=False,
        multiple=True,
    ),
    StandardAttributeSchemaField(
        name="evaporator_saturated_refrigerant_temperature",
        data_type=DataType.FLOAT,
        required=False,
        multiple=True,
    ),
    StandardAttributeSchemaField(
        name="evaporator_refrigerant_pressure",
        data_type=DataType.FLOAT,
        required=False,
        multiple=True,
    ),
]

awhp_schema = StandardAttributeSchema(
    key="awhp",
    name="Air-to-Water Heat Pump",
    fields=awhp_fields,
)
