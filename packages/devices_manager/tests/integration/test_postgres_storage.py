from __future__ import annotations

import json
import os
from datetime import UTC, datetime

import asyncpg
import pytest
import pytest_asyncio

from devices_manager.core.device import Attribute
from devices_manager.core.driver import AttributeDriver
from devices_manager.dto import Device, Transport
from devices_manager.dto.driver_dto import DriverSpec
from devices_manager.dto.transport_dto import build_dto as build_transport
from devices_manager.storage.postgres import (
    PostgresDevicesManagerStorage,
    PostgresDeviceStorage,
    PostgresDriverStorage,
    PostgresTransportStorage,
    run_migrations,
)
from devices_manager.types import (
    DataType,
    DeviceKind,
    TransportProtocols,
)

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_transport(
    transport_id: str = "t1",
    name: str = "Test Transport",
    protocol: TransportProtocols = TransportProtocols.HTTP,
) -> Transport:
    return build_transport(
        transport_id=transport_id,
        name=name,
        protocol=protocol,
        config={"request_timeout": 10},
    )


def _make_driver(
    driver_id: str = "d1",
    vendor: str | None = "acme",
    model: str | None = "thermostat-v2",
    driver_type: str | None = "hvac/thermostat",
) -> DriverSpec:
    return DriverSpec(  # ty: ignore[missing-argument]
        id=driver_id,
        vendor=vendor,
        model=model,
        transport=TransportProtocols.HTTP,
        device_config=[],
        attributes=[
            AttributeDriver(  # ty: ignore[missing-argument]
                name="temperature",
                data_type=DataType.FLOAT,
                read={"path": "/api/temp"},
            ),
        ],
        type=driver_type,
    )


def _make_device(  # noqa: PLR0913
    device_id: str = "dev1",
    driver_id: str = "d1",
    transport_id: str = "t1",
    kind: DeviceKind = DeviceKind.PHYSICAL,
    name: str = "Test Device",
    attributes: dict[str, Attribute] | None = None,
) -> Device:
    return Device(
        id=device_id,
        kind=kind,
        name=name,
        type="hvac/thermostat",
        config={"address": "1"},
        driver_id=driver_id,
        transport_id=transport_id,
        attributes=attributes or {},
        is_faulty=False,
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def pool():
    assert POSTGRES_URL is not None
    run_migrations(POSTGRES_URL)

    async def _init_connection(conn: asyncpg.Connection) -> None:
        await conn.set_type_codec(
            "jsonb",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
        )

    pool = await asyncpg.create_pool(POSTGRES_URL, init=_init_connection)

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM dm_device_attributes")
        await conn.execute("DELETE FROM dm_devices")
        await conn.execute("DELETE FROM dm_drivers")
        await conn.execute("DELETE FROM dm_transports")

    yield pool

    await pool.close()


@pytest_asyncio.fixture
async def transport_storage(pool: asyncpg.Pool):
    return PostgresTransportStorage(pool)


@pytest_asyncio.fixture
async def driver_storage(pool: asyncpg.Pool):
    return PostgresDriverStorage(pool)


@pytest_asyncio.fixture
async def device_storage(pool: asyncpg.Pool):
    return PostgresDeviceStorage(pool)


@pytest_asyncio.fixture
async def composed_storage(pool: asyncpg.Pool):
    return PostgresDevicesManagerStorage(pool)


# ---------------------------------------------------------------------------
# Transport Storage
# ---------------------------------------------------------------------------


class TestTransportStorage:
    async def test_write_and_read(self, transport_storage: PostgresTransportStorage):
        transport = _make_transport()
        await transport_storage.write(transport.id, transport)

        result = await transport_storage.read(transport.id)
        assert result.id == transport.id
        assert result.name == transport.name
        assert result.protocol == transport.protocol

    async def test_read_not_found(self, transport_storage: PostgresTransportStorage):
        with pytest.raises(FileNotFoundError):
            await transport_storage.read("nonexistent")

    async def test_read_all(self, transport_storage: PostgresTransportStorage):
        await transport_storage.write("t1", _make_transport("t1", name="First"))
        await transport_storage.write("t2", _make_transport("t2", name="Second"))

        results = await transport_storage.read_all()
        assert len(results) == 2
        assert {r.id for r in results} == {"t1", "t2"}

    async def test_list_all(self, transport_storage: PostgresTransportStorage):
        await transport_storage.write("t1", _make_transport("t1"))
        await transport_storage.write("t2", _make_transport("t2"))

        ids = await transport_storage.list_all()
        assert ids == ["t1", "t2"]

    async def test_update_on_conflict(
        self, transport_storage: PostgresTransportStorage
    ):
        await transport_storage.write("t1", _make_transport("t1", name="Original"))
        await transport_storage.write("t1", _make_transport("t1", name="Updated"))

        result = await transport_storage.read("t1")
        assert result.name == "Updated"

    async def test_delete(self, transport_storage: PostgresTransportStorage):
        await transport_storage.write("t1", _make_transport("t1"))
        await transport_storage.delete("t1")

        with pytest.raises(FileNotFoundError):
            await transport_storage.read("t1")

    async def test_delete_not_found(self, transport_storage: PostgresTransportStorage):
        with pytest.raises(FileNotFoundError):
            await transport_storage.delete("nonexistent")


# ---------------------------------------------------------------------------
# Driver Storage
# ---------------------------------------------------------------------------


class TestDriverStorage:
    async def test_write_and_read(self, driver_storage: PostgresDriverStorage):
        driver = _make_driver()
        await driver_storage.write(driver.id, driver)

        result = await driver_storage.read(driver.id)
        assert result.id == driver.id
        assert result.vendor == "acme"
        assert result.model == "thermostat-v2"
        assert result.type == "hvac/thermostat"
        assert result.transport == TransportProtocols.HTTP
        assert len(result.attributes) == 1
        assert result.attributes[0].name == "temperature"

    async def test_read_not_found(self, driver_storage: PostgresDriverStorage):
        with pytest.raises(FileNotFoundError):
            await driver_storage.read("nonexistent")

    async def test_read_all(self, driver_storage: PostgresDriverStorage):
        await driver_storage.write("d1", _make_driver("d1", vendor="acme"))
        await driver_storage.write("d2", _make_driver("d2", vendor="other"))

        results = await driver_storage.read_all()
        assert len(results) == 2

    async def test_list_all(self, driver_storage: PostgresDriverStorage):
        await driver_storage.write("d1", _make_driver("d1"))
        ids = await driver_storage.list_all()
        assert ids == ["d1"]

    async def test_update_on_conflict(self, driver_storage: PostgresDriverStorage):
        await driver_storage.write("d1", _make_driver("d1", vendor="old"))
        await driver_storage.write("d1", _make_driver("d1", vendor="new"))

        result = await driver_storage.read("d1")
        assert result.vendor == "new"

    async def test_delete(self, driver_storage: PostgresDriverStorage):
        await driver_storage.write("d1", _make_driver("d1"))
        await driver_storage.delete("d1")

        with pytest.raises(FileNotFoundError):
            await driver_storage.read("d1")

    async def test_delete_not_found(self, driver_storage: PostgresDriverStorage):
        with pytest.raises(FileNotFoundError):
            await driver_storage.delete("nonexistent")

    async def test_nullable_columns(self, driver_storage: PostgresDriverStorage):
        driver = _make_driver("d1", vendor=None, model=None, driver_type=None)
        await driver_storage.write(driver.id, driver)

        result = await driver_storage.read(driver.id)
        assert result.vendor is None
        assert result.model is None
        assert result.type is None


# ---------------------------------------------------------------------------
# Device Storage
# ---------------------------------------------------------------------------


class TestDeviceStorage:
    async def test_write_and_read(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))

        device = _make_device()
        await device_storage.write(device.id, device)

        result = await device_storage.read(device.id)
        assert result.id == device.id
        assert result.kind == DeviceKind.PHYSICAL
        assert result.name == "Test Device"
        assert result.driver_id == "d1"
        assert result.transport_id == "t1"
        assert result.config == {"address": "1"}

    async def test_read_not_found(self, device_storage: PostgresDeviceStorage):
        with pytest.raises(FileNotFoundError):
            await device_storage.read("nonexistent")

    async def test_write_with_attributes(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))

        now = datetime.now(UTC)
        attrs = {
            "temperature": Attribute(
                name="temperature",
                data_type=DataType.FLOAT,
                read_write_modes={"read"},
                current_value=22.5,
                last_updated=now,
                last_changed=now,
            ),
        }
        device = _make_device(attributes=attrs)
        await device_storage.write(device.id, device)

        result = await device_storage.read(device.id)
        assert "temperature" in result.attributes
        attr = result.attributes["temperature"]
        assert attr.current_value == 22.5
        assert attr.data_type == DataType.FLOAT
        assert attr.read_write_modes == {"read"}

    async def test_attributes_updated_on_write(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))

        # Write with one attribute
        attrs_v1 = {
            "temperature": Attribute.create(
                "temperature", DataType.FLOAT, {"read"}, 20.0
            ),
        }
        await device_storage.write("dev1", _make_device(attributes=attrs_v1))

        # Overwrite with different attributes
        attrs_v2 = {
            "humidity": Attribute.create("humidity", DataType.FLOAT, {"read"}, 55.0),
        }
        await device_storage.write("dev1", _make_device(attributes=attrs_v2))

        result = await device_storage.read("dev1")
        assert "humidity" in result.attributes
        assert "temperature" not in result.attributes

    async def test_read_all(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))
        await device_storage.write("dev1", _make_device("dev1"))
        await device_storage.write("dev2", _make_device("dev2"))

        results = await device_storage.read_all()
        assert len(results) == 2
        assert {d.id for d in results} == {"dev1", "dev2"}

    async def test_read_all_with_attributes(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))

        attrs = {
            "temp": Attribute.create("temp", DataType.FLOAT, {"read"}, 21.0),
        }
        await device_storage.write("dev1", _make_device("dev1", attributes=attrs))
        await device_storage.write("dev2", _make_device("dev2"))

        results = await device_storage.read_all()
        dev1 = next(d for d in results if d.id == "dev1")
        dev2 = next(d for d in results if d.id == "dev2")
        assert "temp" in dev1.attributes
        assert dev1.attributes["temp"].current_value == 21.0
        assert len(dev2.attributes) == 0

    async def test_list_all(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))
        await device_storage.write("dev1", _make_device("dev1"))

        ids = await device_storage.list_all()
        assert ids == ["dev1"]

    async def test_delete(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))
        await device_storage.write("dev1", _make_device("dev1"))

        await device_storage.delete("dev1")

        with pytest.raises(FileNotFoundError):
            await device_storage.read("dev1")

    async def test_delete_not_found(self, device_storage: PostgresDeviceStorage):
        with pytest.raises(FileNotFoundError):
            await device_storage.delete("nonexistent")

    async def test_delete_cascades_attributes(
        self,
        pool: asyncpg.Pool,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))

        attrs = {
            "temp": Attribute.create("temp", DataType.FLOAT, {"read"}, 22.0),
        }
        await device_storage.write("dev1", _make_device("dev1", attributes=attrs))
        await device_storage.delete("dev1")

        # Verify attributes are also gone
        count = await pool.fetchval(
            "SELECT COUNT(*) FROM dm_device_attributes WHERE device_id = $1",
            "dev1",
        )
        assert count == 0

    async def test_virtual_device(
        self,
        device_storage: PostgresDeviceStorage,
    ):
        device = Device(
            id="vdev1",
            kind=DeviceKind.VIRTUAL,
            name="Virtual Sensor",
            type="sensor",
            attributes={
                "value": Attribute.create(
                    "value", DataType.FLOAT, {"read", "write"}, 42.0
                ),
            },
            is_faulty=False,
        )
        await device_storage.write(device.id, device)

        result = await device_storage.read(device.id)
        assert result.kind == DeviceKind.VIRTUAL
        assert result.driver_id is None
        assert result.transport_id is None
        assert result.attributes["value"].current_value == 42.0


# ---------------------------------------------------------------------------
# Foreign Key Constraints
# ---------------------------------------------------------------------------


class TestForeignKeys:
    async def test_device_references_driver_and_transport(
        self,
        pool: asyncpg.Pool,
    ):
        """Device insert with non-existent driver/transport FK should fail."""
        with pytest.raises(asyncpg.ForeignKeyViolationError):
            await pool.execute(
                "INSERT INTO dm_devices (id, kind, name, driver_id, transport_id) "
                "VALUES ($1, $2, $3, $4, $5)",
                "bad-dev",
                "physical",
                "Bad Device",
                "nonexistent-driver",
                "nonexistent-transport",
            )

    async def test_cannot_delete_transport_referenced_by_device(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))
        await device_storage.write("dev1", _make_device("dev1"))

        with pytest.raises(asyncpg.ForeignKeyViolationError):
            await transport_storage.delete("t1")

    async def test_cannot_delete_driver_referenced_by_device(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))
        await device_storage.write("dev1", _make_device("dev1"))

        with pytest.raises(asyncpg.ForeignKeyViolationError):
            await driver_storage.delete("d1")


# ---------------------------------------------------------------------------
# Composed Storage
# ---------------------------------------------------------------------------


class TestComposedStorage:
    async def test_full_round_trip(
        self, composed_storage: PostgresDevicesManagerStorage
    ):
        transport = _make_transport()
        await composed_storage.transports.write(transport.id, transport)

        driver = _make_driver()
        await composed_storage.drivers.write(driver.id, driver)

        device = _make_device()
        await composed_storage.devices.write(device.id, device)

        result = await composed_storage.devices.read(device.id)
        assert result.id == device.id
        assert result.driver_id == "d1"
        assert result.transport_id == "t1"


# ---------------------------------------------------------------------------
# Attribute Persistence (save_attribute)
# ---------------------------------------------------------------------------


class TestAttributePersistence:
    async def test_save_attribute_creates_new(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))
        await device_storage.write("dev1", _make_device("dev1"))

        attr = Attribute.create("temp", DataType.FLOAT, {"read"}, 23.5)
        await device_storage.save_attribute("dev1", attr)

        result = await device_storage.read("dev1")
        assert "temp" in result.attributes
        assert result.attributes["temp"].current_value == 23.5

    async def test_save_attribute_updates_existing(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))

        attrs = {
            "temp": Attribute.create("temp", DataType.FLOAT, {"read"}, 20.0),
        }
        await device_storage.write("dev1", _make_device("dev1", attributes=attrs))

        updated = Attribute.create("temp", DataType.FLOAT, {"read"}, 25.0)
        await device_storage.save_attribute("dev1", updated)

        result = await device_storage.read("dev1")
        assert result.attributes["temp"].current_value == 25.0

    async def test_save_attribute_via_composed_storage(
        self,
        composed_storage: PostgresDevicesManagerStorage,
    ):
        await composed_storage.transports.write("t1", _make_transport("t1"))
        await composed_storage.drivers.write("d1", _make_driver("d1"))
        await composed_storage.devices.write("dev1", _make_device("dev1"))

        attr = Attribute.create("humidity", DataType.FLOAT, {"read"}, 60.0)
        await composed_storage.save_attribute("dev1", attr)

        result = await composed_storage.devices.read("dev1")
        assert result.attributes["humidity"].current_value == 60.0

    async def test_tags_write_and_read_roundtrip(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))

        device = _make_device("dev1")
        device.tags = {"asset_id": "asset-abc", "zone": "north"}
        await device_storage.write(device.id, device)

        result = await device_storage.read(device.id)
        assert result.tags == {"asset_id": "asset-abc", "zone": "north"}

    async def test_tags_overwrite_on_write(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))

        device = _make_device("dev1")
        device.tags = {"asset_id": "old-asset"}
        await device_storage.write(device.id, device)

        device.tags = {"asset_id": "new-asset"}
        await device_storage.write(device.id, device)

        result = await device_storage.read(device.id)
        assert result.tags == {"asset_id": "new-asset"}

    async def test_tags_cascade_delete(
        self,
        pool: asyncpg.Pool,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))

        device = _make_device("dev1")
        device.tags = {"asset_id": "asset-abc"}
        await device_storage.write(device.id, device)
        await device_storage.delete("dev1")

        count = await pool.fetchval(
            "SELECT COUNT(*) FROM dm_device_tags WHERE device_id = $1", "dev1"
        )
        assert count == 0

    async def test_virtual_device_attribute_round_trip(
        self,
        device_storage: PostgresDeviceStorage,
    ):
        """Virtual device attributes persist and restore correctly."""
        device = Device(
            id="vdev1",
            kind=DeviceKind.VIRTUAL,
            name="Virtual Sensor",
            type="sensor",
            attributes={
                "value": Attribute.create(
                    "value",
                    DataType.FLOAT,
                    {"read", "write"},
                    42.0,
                ),
            },
            is_faulty=False,
        )
        await device_storage.write(device.id, device)

        # Update attribute via save_attribute
        updated = Attribute.create("value", DataType.FLOAT, {"read", "write"}, 99.0)
        await device_storage.save_attribute("vdev1", updated)

        # Read back and verify
        result = await device_storage.read("vdev1")
        assert result.kind == DeviceKind.VIRTUAL
        assert result.attributes["value"].current_value == 99.0
