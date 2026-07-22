from __future__ import annotations

import pytest
from pydantic import ValidationError

from api.schemas.device import DeviceBatchItemResult
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
