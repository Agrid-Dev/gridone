from __future__ import annotations

import pytest
from pydantic import ValidationError

from devices_manager.core.device_filters import DeviceFilters
from devices_manager.dto import DevicesQuery, device_query_to_filters
from models.targets import DevicesFilter
from models.types import DataType


class TestDevicesQuery:
    def test_an_empty_query_matches_every_device(self):
        assert DevicesQuery().matches_every_device()

    def test_from_filter_selects_exactly_what_the_filter_selects(self):
        persisted = DevicesFilter(driver_id="drv", types=["thermostat"])

        query = DevicesQuery.from_filter(persisted)

        assert query == DevicesQuery(driver_id="drv", types=["thermostat"])
        assert query.search is None

    def test_an_unknown_criterion_is_refused(self):
        with pytest.raises(ValidationError):
            DevicesQuery(name="Room")  # type: ignore[call-arg]


class TestDeviceQueryToFilters:
    def test_no_query_matches_everything(self):
        assert device_query_to_filters(None) == DeviceFilters()

    def test_every_criterion_reaches_the_matcher(self):
        query = DevicesQuery(
            ids=["d1"],
            types=["other"],
            tags={"zone": ["north"]},
            driver_id="drv",
            attribute="temperature",
            writable_attribute="setpoint",
            writable_attribute_type=DataType.FLOAT,
            is_faulty=True,
            search="room",
            transport_id="tr",
        )

        assert device_query_to_filters(query) == DeviceFilters(
            ids=["d1"],
            types=["other"],
            tags={"zone": ["north"]},
            driver_id="drv",
            attribute="temperature",
            writable_attribute="setpoint",
            writable_attribute_type=DataType.FLOAT,
            is_faulty=True,
            search="room",
            transport_id="tr",
        )
