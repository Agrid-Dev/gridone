from __future__ import annotations

from datetime import UTC, datetime

import pytest
from timeseries.domain import (
    DATA_TYPE_MAP,
    DataPoint,
    DataType,
    SeriesKey,
    TimeSeries,
    validate_value_type,
)


class TestDataType:
    def test_values(self):
        assert DataType.INTEGER == "integer"
        assert DataType.FLOAT == "float"
        assert DataType.BOOLEAN == "boolean"
        assert DataType.STRING == "string"

    def test_data_type_map_covers_all_variants(self):
        assert set(DATA_TYPE_MAP.keys()) == set(DataType)

    def test_data_type_map_types(self):
        assert DATA_TYPE_MAP[DataType.INTEGER] is int
        assert DATA_TYPE_MAP[DataType.FLOAT] is float
        assert DATA_TYPE_MAP[DataType.BOOLEAN] is bool
        assert DATA_TYPE_MAP[DataType.STRING] is str


class TestDataPoint:
    def test_creation(self):
        ts = datetime(2026, 1, 1, tzinfo=UTC)
        dp = DataPoint(timestamp=ts, value=42.0)
        assert dp.timestamp == ts
        assert dp.value == 42.0

    def test_frozen(self):
        dp = DataPoint(timestamp=datetime.now(tz=UTC), value=1)
        with pytest.raises(AttributeError):
            dp.value = 2  # type: ignore[misc]


class TestTimeSeries:
    def test_defaults(self):
        ts = TimeSeries(
            data_type=DataType.FLOAT,
            owner_type="device",
            owner_id="sensor-01",
            metric="temperature",
        )
        assert isinstance(ts.id, str)
        assert len(ts.id) == 16
        assert isinstance(ts.created_at, datetime)
        assert isinstance(ts.updated_at, datetime)
        assert ts.data_points == []

    def test_with_data_points(self):
        now = datetime.now(tz=UTC)
        dp = DataPoint(timestamp=now, value=23.5)
        ts = TimeSeries(
            data_type=DataType.FLOAT,
            owner_type="device",
            owner_id="sensor-01",
            metric="temperature",
            data_points=[dp],
        )
        assert len(ts.data_points) == 1
        assert ts.data_points[0].value == 23.5

    def test_each_data_type(self):
        now = datetime.now(tz=UTC)
        cases = [
            (DataType.INTEGER, 42),
            (DataType.FLOAT, 3.14),
            (DataType.BOOLEAN, True),
            (DataType.STRING, "hello"),
        ]
        for dt, val in cases:
            ts = TimeSeries(
                data_type=dt,
                owner_type="device",
                owner_id="d1",
                metric="m",
                data_points=[DataPoint(timestamp=now, value=val)],  # ty: ignore[invalid-argument-type]
            )
            assert ts.data_points[0].value == val


class TestSeriesKey:
    def test_creation(self):
        key = SeriesKey(owner_id="s1", metric="temperature")
        assert key.owner_id == "s1"
        assert key.metric == "temperature"

    def test_frozen(self):
        key = SeriesKey(owner_id="s1", metric="temperature")
        with pytest.raises(AttributeError):
            key.metric = "other"  # type: ignore[misc]

    def test_equality(self):
        a = SeriesKey(owner_id="s1", metric="temperature")
        b = SeriesKey(owner_id="s1", metric="temperature")
        assert a == b

    def test_hashable(self):
        a = SeriesKey(owner_id="s1", metric="temperature")
        b = SeriesKey(owner_id="s1", metric="temperature")
        assert hash(a) == hash(b)
        assert len({a, b}) == 1

    def test_timeseries_key_property(self):
        ts = TimeSeries(
            data_type=DataType.FLOAT,
            owner_type="device",
            owner_id="s1",
            metric="temperature",
        )
        expected = SeriesKey(owner_id="s1", metric="temperature")
        assert ts.key == expected


class TestValidateValueType:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            (42, int),
            (3.14, float),
            (True, bool),
            ("hello", str),
        ],
    )
    def test_valid(self, value, expected):
        validate_value_type(value, expected)

    def test_wrong_type_raises(self):
        with pytest.raises(TypeError, match="Expected float, got str"):
            validate_value_type("oops", float)

    def test_bool_rejected_as_int(self):
        with pytest.raises(TypeError, match="Expected int, got bool"):
            validate_value_type(True, int)  # noqa: FBT003

    def test_int_rejected_as_bool(self):
        with pytest.raises(TypeError, match="Expected bool, got int"):
            validate_value_type(1, bool)

    def test_int_rejected_as_float(self):
        with pytest.raises(TypeError, match="Expected float, got int"):
            validate_value_type(1, float)
