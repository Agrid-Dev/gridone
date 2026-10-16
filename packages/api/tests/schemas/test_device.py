from __future__ import annotations

import pytest
from pydantic import ValidationError

from api.schemas.device import (
    DeviceBatchCreate,
    DeviceBatchItemResult,
    to_devices_page_response,
)
from devices_manager.dto import DeviceFacets, DeviceHealth
from devices_manager.dto.device_dto import Device
from devices_manager.types import ConnectionStatus
from models.pagination import Page


def _device() -> Device:
    return Device(
        id="d1",
        name="D",
        config={},
        driver_id="driver",
        transport_id="transport",
        is_faulty=False,
    )


class TestToDevicesPageResponse:
    def test_carries_the_page_its_links_and_the_facets(self):
        device = _device()
        page = Page(items=[device], total=7, page=2, size=3)
        facets = DeviceFacets(
            type={"other": 7},
            health={DeviceHealth.HEALTHY: 7, DeviceHealth.FAULTY: 0},
            connection_status=dict.fromkeys(ConnectionStatus, 0),
        )

        response = to_devices_page_response(page, facets, "http://api/devices/")

        assert response.items == [device]
        assert (response.total, response.page, response.size) == (7, 2, 3)
        assert response.total_pages == 3
        assert response.facets is facets
        payload = response.model_dump(by_alias=True)
        assert payload["links"]["self"] == "http://api/devices/?page=2&size=3"
        assert payload["links"]["next"] == "http://api/devices/?page=3&size=3"
        assert payload["facets"]["type"] == {"other": 7}


class TestDeviceBatchItemResult:
    def test_device_only_is_valid(self):
        result = DeviceBatchItemResult(device=_device())
        assert result.error is None

    def test_error_only_is_valid(self):
        result = DeviceBatchItemResult(error="failed")
        assert result.device is None

    def test_neither_set_is_rejected(self):
        with pytest.raises(ValidationError):
            DeviceBatchItemResult()

    def test_both_set_is_rejected(self):
        with pytest.raises(ValidationError):
            DeviceBatchItemResult(device=_device(), error="failed")


class TestDeviceBatchCreate:
    @staticmethod
    def _payload(devices: list[dict]) -> dict:
        return {"driver_id": "driver", "transport_id": "transport", "devices": devices}

    def test_named_entries_are_valid(self):
        batch = DeviceBatchCreate.model_validate(
            self._payload([{"name": "A", "config": {}}])
        )
        assert batch.devices[0].name == "A"

    def test_empty_devices_list_is_rejected(self):
        with pytest.raises(ValidationError):
            DeviceBatchCreate.model_validate(self._payload([]))

    @pytest.mark.parametrize("entry", [{"config": {}}, {"name": "", "config": {}}])
    def test_missing_or_blank_name_is_rejected(self, entry: dict):
        with pytest.raises(ValidationError):
            DeviceBatchCreate.model_validate(self._payload([entry]))
