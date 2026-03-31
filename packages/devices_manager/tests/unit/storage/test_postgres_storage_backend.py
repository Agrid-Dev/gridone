from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from devices_manager.core.device import Attribute
from devices_manager.dto.device_dto import DeviceDTO
from devices_manager.storage.postgres.postgres_storage import PostgresStorageBackend
from devices_manager.types import DataType, DeviceKind


class _FakePool:
    """Minimal asyncpg.Pool stand-in for testing JSON payload round-trips."""

    def __init__(self) -> None:
        self._payload_by_id: dict[str, str] = {}

    async def execute(self, _query: str, item_id: str, payload: str) -> None:
        self._payload_by_id[item_id] = payload

    async def fetchrow(self, _query: str, item_id: str) -> dict[str, str] | None:
        try:
            payload = self._payload_by_id[item_id]
        except KeyError:
            return None
        return {"data": payload}


def _make_backend() -> tuple[_FakePool, PostgresStorageBackend[DeviceDTO]]:
    pool = _FakePool()
    backend: PostgresStorageBackend[DeviceDTO] = PostgresStorageBackend(
        table_name="dm_devices",
        pool=pool,  # type: ignore[arg-type]
        deserializer=DeviceDTO.model_validate,
    )
    return pool, backend


@pytest.mark.asyncio
async def test_physical_device_attribute_state_round_trips() -> None:
    """Full Attribute state (value + timestamps) persists for physical devices."""
    pool, backend = _make_backend()

    attr = Attribute(
        name="temperature",
        data_type=DataType.FLOAT,
        read_write_modes={"read"},
        current_value=21.5,
        last_updated=datetime.now(UTC),
        last_changed=datetime.now(UTC),
    )
    dto = DeviceDTO(
        id="dev1",
        kind=DeviceKind.PHYSICAL,
        name="Chiller",
        attributes={"temperature": attr},
    )

    await backend.write(dto.id, dto)

    raw = json.loads(pool._payload_by_id[dto.id])
    assert raw["attributes"]["temperature"]["current_value"] == 21.5
    assert raw["attributes"]["temperature"]["last_updated"] is not None
    assert raw["attributes"]["temperature"]["last_changed"] is not None

    restored = await backend.read(dto.id)
    restored_attr = restored.attributes["temperature"]
    assert restored_attr.current_value == 21.5
    assert restored_attr.last_updated is not None
    assert restored_attr.last_changed is not None


@pytest.mark.asyncio
async def test_virtual_device_attribute_state_round_trips() -> None:
    """DeviceDTO with kind=VIRTUAL and attributes persists and restores correctly."""
    pool, backend = _make_backend()

    attr = Attribute(
        name="occupied",
        data_type=DataType.BOOL,
        read_write_modes={"write"},
        current_value=True,
        last_updated=datetime.now(UTC),
        last_changed=datetime.now(UTC),
    )
    dto = DeviceDTO(
        id="vdev1",
        kind=DeviceKind.VIRTUAL,
        name="Occupancy sensor",
        attributes={"occupied": attr},
    )

    await backend.write(dto.id, dto)

    raw = json.loads(pool._payload_by_id[dto.id])
    assert raw["kind"] == DeviceKind.VIRTUAL
    assert raw["attributes"]["occupied"]["current_value"] is True
    assert raw["attributes"]["occupied"]["last_updated"] is not None

    restored = await backend.read(dto.id)
    assert restored.kind == DeviceKind.VIRTUAL
    assert restored.attributes["occupied"].current_value is True
    assert restored.attributes["occupied"].last_updated is not None


@pytest.mark.asyncio
async def test_device_without_attribute_values_round_trips() -> None:
    """Existing devices with no stored attribute values restore with None."""
    _, backend = _make_backend()

    attr = Attribute(
        name="temperature",
        data_type=DataType.FLOAT,
        read_write_modes={"read"},
        current_value=None,
        last_updated=None,
        last_changed=None,
    )
    dto = DeviceDTO(
        id="dev_empty",
        kind=DeviceKind.PHYSICAL,
        name="Legacy device",
        attributes={"temperature": attr},
    )

    await backend.write(dto.id, dto)
    restored = await backend.read(dto.id)
    assert restored.attributes["temperature"].current_value is None
    assert restored.attributes["temperature"].last_updated is None
