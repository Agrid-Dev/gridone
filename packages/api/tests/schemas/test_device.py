from __future__ import annotations

import pytest
from pydantic import ValidationError

from api.schemas.device import (
    DeviceBatchCreate,
    DeviceBatchItemResult,
)
from devices_manager.dto.device_dto import Device


def _device() -> Device:
    return Device(
        id="d1",
        name="D",
        config={},
        driver_id="driver",
        transport_id="transport",
        is_faulty=False,
    )


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
