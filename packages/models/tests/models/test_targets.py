import pytest
from pydantic import ValidationError

from models.errors import InvalidError
from models.targets import AttributeTarget, DevicesFilter, unify_data_types
from models.types import DataType


class TestDevicesFilter:
    def test_empty_filter_is_valid(self):
        devices_filter = DevicesFilter()
        assert devices_filter.ids is None
        assert devices_filter.types is None
        assert devices_filter.tags is None

    def test_rejects_unknown_fields(self):
        with pytest.raises(ValidationError):
            DevicesFilter(search="thermo")  # ty: ignore[unknown-argument]

    def test_rejects_runtime_query_fields(self):
        with pytest.raises(ValidationError):
            DevicesFilter(is_faulty=True)  # ty: ignore[unknown-argument]


class TestAttributeTarget:
    def test_round_trips_persisted_shape(self):
        target = AttributeTarget.model_validate(
            {"devices": {"types": ["thermostat"]}, "attribute": "temperature"}
        )
        assert target.devices.types == ["thermostat"]
        assert target.attribute == "temperature"

    def test_rejects_empty_attribute(self):
        with pytest.raises(ValidationError):
            AttributeTarget(devices=DevicesFilter(), attribute="")

    def test_rejects_unknown_fields(self):
        with pytest.raises(ValidationError):
            AttributeTarget.model_validate(
                {"devices": {}, "attribute": "temperature", "writable": True}
            )


class TestUnifyDataTypes:
    def test_single_type(self):
        assert unify_data_types([DataType.FLOAT]) == DataType.FLOAT

    def test_repeated_same_type(self):
        assert unify_data_types([DataType.INT, DataType.INT]) == DataType.INT

    def test_mixed_types_raise(self):
        with pytest.raises(InvalidError, match="float, int"):
            unify_data_types([DataType.INT, DataType.FLOAT])

    def test_empty_raises(self):
        with pytest.raises(InvalidError, match="no device"):
            unify_data_types([])
