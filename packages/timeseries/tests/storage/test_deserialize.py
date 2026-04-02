from __future__ import annotations

import pytest

from models.types import DataType
from timeseries.storage.postgres.deserialize import deserialize_command_value


class TestDeserializeString:
    def test_plain_string(self):
        assert deserialize_command_value("hello", DataType.STRING) == "hello"

    def test_empty_string(self):
        assert deserialize_command_value("", DataType.STRING) == ""

    def test_numeric_string_stays_string(self):
        assert deserialize_command_value("42", DataType.STRING) == "42"


class TestDeserializeBool:
    @pytest.mark.parametrize("raw", ["True", "true", "TRUE", "tRuE"])
    def test_true_variants(self, raw: str):
        assert deserialize_command_value(raw, DataType.BOOL) is True

    @pytest.mark.parametrize("raw", ["False", "false", "FALSE", "fAlSe"])
    def test_false_variants(self, raw: str):
        assert deserialize_command_value(raw, DataType.BOOL) is False

    def test_one_is_true(self):
        assert deserialize_command_value("1", DataType.BOOL) is True

    def test_zero_is_false(self):
        assert deserialize_command_value("0", DataType.BOOL) is False

    def test_invalid_raises(self):
        with pytest.raises(ValueError, match="Cannot deserialize"):
            deserialize_command_value("yes", DataType.BOOL)


class TestDeserializeInt:
    def test_positive(self):
        result = deserialize_command_value("42", DataType.INT)
        assert result == 42
        assert type(result) is int

    def test_negative(self):
        assert deserialize_command_value("-7", DataType.INT) == -7

    def test_zero(self):
        assert deserialize_command_value("0", DataType.INT) == 0

    def test_invalid_raises(self):
        with pytest.raises(ValueError, match="invalid literal"):
            deserialize_command_value("not_a_number", DataType.INT)

    def test_float_string_raises(self):
        with pytest.raises(ValueError, match="invalid literal"):
            deserialize_command_value("3.14", DataType.INT)


class TestDeserializeFloat:
    def test_positive(self):
        result = deserialize_command_value("3.14", DataType.FLOAT)
        assert result == pytest.approx(3.14)
        assert type(result) is float

    def test_negative(self):
        assert deserialize_command_value("-2.5", DataType.FLOAT) == pytest.approx(-2.5)

    def test_zero(self):
        assert deserialize_command_value("0.0", DataType.FLOAT) == 0.0

    def test_integer_string(self):
        result = deserialize_command_value("42", DataType.FLOAT)
        assert result == 42.0
        assert type(result) is float

    def test_invalid_raises(self):
        with pytest.raises(ValueError, match="could not convert"):
            deserialize_command_value("not_a_number", DataType.FLOAT)
