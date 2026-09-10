from __future__ import annotations

import hashlib
import json
import os
from copy import deepcopy
from datetime import UTC, datetime

import asyncpg
import pytest
import pytest_asyncio

from devices_manager import DevicesService
from devices_manager.core.device import Attribute, CoreDevice
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    LocalizedText,
    UpdateStrategy,
    WriteConstraints,
)
from devices_manager.core.presentation import PresentationEnvelope
from devices_manager.core.presentation.resource import NormalizedImage
from devices_manager.core.transports import (
    TransportClient,
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from devices_manager.storage.postgres import (
    PostgresDevicesManagerStorage,
    PostgresDeviceStorage,
    PostgresDriverStorage,
    PostgresTransportStorage,
    run_migrations,
)
from devices_manager.types import (
    DataType,
    TransportProtocols,
)
from models.errors import ConflictError

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
) -> TransportClient:
    return make_transport_client(
        protocol,
        make_transport_config(protocol, {"request_timeout": 10}),
        TransportMetadata(id=transport_id, name=name),
    )


def _attr(name: str, data_type: DataType = DataType.FLOAT) -> AttributeDriver:
    return AttributeDriver(  # ty: ignore[missing-argument]
        name=name,
        data_type=data_type,
        read={"path": f"/api/{name}"},
    )


def _make_driver(
    driver_id: str = "d1",
    vendor: str | None = "acme",
    model: str | None = "thermostat-v2",
) -> Driver:
    return Driver(
        metadata=DriverMetadata(id=driver_id, vendor=vendor, model=model),
        transport=TransportProtocols.HTTP,
        env={},
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={"temperature": _attr("temperature")},
    )


def _make_thermostat_driver(driver_id: str = "d1") -> Driver:
    """A driver with a registered standard type and its required attributes."""
    attrs = [
        _attr("temperature"),
        _attr("temperature_setpoint"),
        _attr("onoff_state", DataType.BOOL),
        _attr("mode", DataType.STRING),
    ]
    return Driver(
        metadata=DriverMetadata(id=driver_id, vendor="acme", model="thermostat-v2"),
        transport=TransportProtocols.HTTP,
        env={},
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={a.name: a for a in attrs},
        type="thermostat",
    )


def _make_device(
    device_id: str = "dev1",
    driver_id: str = "d1",
    transport_id: str = "t1",
    name: str = "Test Device",
    attributes: dict[str, Attribute] | None = None,
) -> CoreDevice:
    # Attributes are passed explicitly (not derived from the driver spec) so
    # storage tests control exactly which attribute rows are written.
    return CoreDevice(
        id=device_id,
        name=name,
        config={"address": "1"},
        driver=_make_driver(driver_id),
        transport=_make_transport(transport_id),
        attributes=attributes or {},
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
        assert result.metadata.name == transport.metadata.name
        assert result.protocol == transport.protocol
        assert result.config == transport.config

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
        assert result.metadata.name == "Updated"

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
        assert result.metadata.vendor == "acme"
        assert result.metadata.model == "thermostat-v2"
        assert result.transport == TransportProtocols.HTTP
        assert set(result.attributes) == {"temperature"}

    async def test_type_column_round_trip(self, driver_storage: PostgresDriverStorage):
        driver = _make_thermostat_driver()
        await driver_storage.write(driver.id, driver)

        result = await driver_storage.read(driver.id)
        assert result.type == "thermostat"
        assert set(result.attributes) == set(driver.attributes)

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
        assert result.metadata.vendor == "new"

    async def test_delete(self, driver_storage: PostgresDriverStorage):
        await driver_storage.write("d1", _make_driver("d1"))
        await driver_storage.delete("d1")

        with pytest.raises(FileNotFoundError):
            await driver_storage.read("d1")

    async def test_delete_not_found(self, driver_storage: PostgresDriverStorage):
        with pytest.raises(FileNotFoundError):
            await driver_storage.delete("nonexistent")

    async def test_nullable_columns(self, driver_storage: PostgresDriverStorage):
        driver = _make_driver("d1", vendor=None, model=None)
        await driver_storage.write(driver.id, driver)

        result = await driver_storage.read(driver.id)
        assert result.metadata.vendor is None
        assert result.metadata.model is None

    async def test_attribute_metadata_round_trip(
        self, driver_storage: PostgresDriverStorage
    ):
        """The optional attribute fields ride in the JSONB `attributes` field."""
        driver = _make_driver()
        driver.attributes["temperature"] = AttributeDriver(  # ty: ignore[missing-argument]
            name="temperature",
            data_type=DataType.FLOAT,
            read={"path": "/api/temperature"},
            label=LocalizedText(
                default="Temperature", translations={"fr": "Température"}
            ),
            description=LocalizedText(default="Room temperature"),
            group="climate",
            unit="°C",
            write_constraints=WriteConstraints(step=0.5, minimum=-40, maximum=80),
        )
        await driver_storage.write(driver.id, driver)

        result = await driver_storage.read(driver.id)
        assert result.attributes["temperature"] == driver.attributes["temperature"]
        assert result.type is None

    @pytest.mark.parametrize(
        "presentation",
        [
            {
                "schema_version": 1,
                "requires": ["layout/1"],
                "page": {"kind": "attributes", "group": "climate"},
            },
            {
                "schema_version": 4,
                "requires": ["hologram/1"],
                "scene": {"nodes": [{"kind": "hologram", "depth": 2.5, "on": [True]}]},
            },
        ],
        ids=["v1", "future_version"],
    )
    async def test_presentation_round_trip(
        self, driver_storage: PostgresDriverStorage, presentation: dict
    ):
        """The presentation envelope rides in the JSONB `presentation` field,
        verbatim whatever its version."""
        driver = _make_driver()
        driver.presentation = PresentationEnvelope.model_validate(presentation)
        await driver_storage.write(driver.id, driver)

        result = await driver_storage.read(driver.id)
        assert result.presentation == driver.presentation
        assert result.presentation is not None
        assert result.presentation.document == presentation

    async def test_presentation_absent_reads_as_none(
        self, driver_storage: PostgresDriverStorage
    ):
        await driver_storage.write("d1", _make_driver("d1"))
        assert (await driver_storage.read("d1")).presentation is None


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
                "INSERT INTO dm_devices (id, name, driver_id, transport_id) "
                "VALUES ($1, $2, $3, $4)",
                "bad-dev",
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

    async def test_tags_removed_keys_deleted_on_write(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))

        device = _make_device("dev1")
        device.tags = {"asset_id": "a1", "zone": "north"}
        await device_storage.write(device.id, device)

        device.tags = {"asset_id": "a1"}
        await device_storage.write(device.id, device)

        result = await device_storage.read(device.id)
        assert result.tags == {"asset_id": "a1"}

    async def test_tags_cleared_on_write_with_empty_tags(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))

        device = _make_device("dev1")
        device.tags = {"asset_id": "a1", "zone": "north"}
        await device_storage.write(device.id, device)

        device.tags = {}
        await device_storage.write(device.id, device)

        result = await device_storage.read(device.id)
        assert result.tags == {}

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

    async def test_set_tag_inserts_new_tag(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))
        await device_storage.write("dev1", _make_device("dev1"))

        await device_storage.set_tag("dev1", "zone", "north", datetime.now(UTC))

        result = await device_storage.read("dev1")
        assert result.tags == {"zone": "north"}

    async def test_set_tag_upserts_existing_tag(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))
        device = _make_device("dev1")
        device.tags = {"zone": "north"}
        await device_storage.write("dev1", device)

        await device_storage.set_tag("dev1", "zone", "south", datetime.now(UTC))

        result = await device_storage.read("dev1")
        assert result.tags == {"zone": "south"}

    async def test_delete_tag_removes_row(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))
        device = _make_device("dev1")
        device.tags = {"zone": "north"}
        await device_storage.write("dev1", device)

        await device_storage.delete_tag("dev1", "zone", datetime.now(UTC))

        result = await device_storage.read("dev1")
        assert "zone" not in result.tags

    async def test_delete_tag_noop_if_missing(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))
        await device_storage.write("dev1", _make_device("dev1"))

        await device_storage.delete_tag("dev1", "nonexistent", datetime.now(UTC))

        result = await device_storage.read("dev1")
        assert result.tags == {}

    async def test_set_tag_survives_read_all_roundtrip(
        self,
        transport_storage: PostgresTransportStorage,
        driver_storage: PostgresDriverStorage,
        device_storage: PostgresDeviceStorage,
    ):
        await transport_storage.write("t1", _make_transport("t1"))
        await driver_storage.write("d1", _make_driver("d1"))
        await device_storage.write("dev1", _make_device("dev1"))

        await device_storage.set_tag("dev1", "asset_id", "asset-xyz", datetime.now(UTC))

        all_devices = await device_storage.read_all()
        dev = next(d for d in all_devices if d.id == "dev1")
        assert dev.tags == {"asset_id": "asset-xyz"}


async def test_presentation_resources_and_driver_cas(composed_storage):
    """The migration, bytea round-trip and JSONB pointer CAS work together."""
    image = NormalizedImage(
        b"normalized", 1, 1, hashlib.sha256(b"normalized").hexdigest()
    )
    resources = composed_storage.presentation_resources
    driver = _make_driver("package-driver")
    async with resources.installation(driver.id):
        await resources.write_revision(driver.id, "first", {"asset": image})
        driver.presentation_revision = "first"
        await composed_storage.drivers.compare_and_swap(driver, None)
    restored = await composed_storage.drivers.read(driver.id)
    assert restored.presentation_revision == "first"
    assert (await resources.read(driver.id, "first", "asset")).data == image.data
    next_driver = deepcopy(restored)
    next_driver.presentation_revision = "second"
    await composed_storage.drivers.compare_and_swap(next_driver, restored)
    with pytest.raises(ConflictError):
        await composed_storage.drivers.compare_and_swap(driver, restored)
    assert (
        await composed_storage.drivers.read(driver.id)
    ).presentation_revision == "second"
    await resources.prune(driver.id, set())
    assert await resources.list_revisions(driver.id) == []


@pytest.mark.parametrize("legacy", [False, True])
async def test_replace_driver_loaded_from_older_storage(driver_storage, pool, legacy):
    original = _make_driver()
    await driver_storage.write(original.id, original)
    if legacy:
        # Older rows omit fields introduced by later versions. Reading supplies
        # their defaults, but does not rewrite the durable JSON document.
        await pool.execute(
            "UPDATE dm_drivers SET data = data - 'presentation' "
            "- 'presentation_revision' - 'healthcheck' "
            "#- '{attributes,0,label}' #- '{attributes,0,write_constraints}' "
            "#- '{attributes,0,codecs}' "
            "WHERE id = $1",
            original.id,
        )
    expected = await driver_storage.read(original.id)
    replacement = deepcopy(expected)
    replacement.metadata.vendor = "replacement"
    await driver_storage.compare_and_swap(replacement, expected)
    assert (await driver_storage.read(original.id)).metadata.vendor == "replacement"
    with pytest.raises(ConflictError):
        await driver_storage.compare_and_swap(original, expected)


async def test_driver_healthcheck_survives_write_and_replacement(driver_storage):
    original = _make_driver()
    original.healthcheck.expected_push_interval = 120
    await driver_storage.write(original.id, original)
    expected = await driver_storage.read(original.id)
    assert expected.healthcheck == original.healthcheck
    replacement = deepcopy(expected)
    replacement.healthcheck.expected_push_interval = 240
    await driver_storage.compare_and_swap(replacement, expected)
    assert (
        await driver_storage.read(original.id)
    ).healthcheck == replacement.healthcheck


async def test_package_replaces_legacy_driver_without_presentation(
    driver_storage, pool
):
    original = _make_driver()
    await driver_storage.write(original.id, original)
    await pool.execute(
        "UPDATE dm_drivers SET data = data - 'presentation' "
        "- 'presentation_revision' WHERE id = $1",
        original.id,
    )
    service = DevicesService(POSTGRES_URL)
    try:
        await service.load()
        assert await service.get_driver_presentation_response(original.id) is None
        package = await service.export_driver_package(original.id)
        installed = await service.install_driver_package(
            original.id, package, "application/zip"
        )
        assert installed.id == original.id
        assert installed.attributes == service.get_driver(original.id).attributes
    finally:
        await service.stop()
