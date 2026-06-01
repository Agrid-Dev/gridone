"""Integration test: options codec enforces valid values end-to-end at the API level.

A PhysicalDevice with a `mode` attribute (options: heat/cool/fan/auto) is wired
into a real DevicesService + CommandsService (both in-memory). POSTing a valid
value must return 200; an invalid value must return 422.
"""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.dependencies import (
    get_commands_service,
    get_current_token_payload,
    get_current_user_id,
    get_device_manager,
)
from api.exception_handlers import register_exception_handlers
from api.routes.devices_router import router
from commands import CommandsService, WriteResult
from devices_manager import DeviceBase, DevicesService, PhysicalDevice
from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.types import DataType, TransportProtocols

pytestmark = pytest.mark.asyncio

_DEVICE_ID = "thermo-01"
_OPTIONS = ["heat", "cool", "fan", "auto"]


@pytest.fixture
def mock_transport():
    transport = MagicMock()
    transport.id = "mock-transport"
    transport.protocol = TransportProtocols.HTTP
    transport.build_address.return_value = MagicMock(id="mock-addr")
    transport.write = AsyncMock()
    return transport


@pytest.fixture
def options_driver() -> Driver:
    return Driver(
        metadata=DriverMetadata(id="options_driver"),
        env={},
        transport=TransportProtocols.HTTP,
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={
            "mode": AttributeDriver(
                name="mode",
                data_type=DataType.STRING,
                read="GET /mode",
                write="POST /mode",
                codecs=[CodecSpec(name="options", argument=_OPTIONS)],
            )
        },
    )


@pytest.fixture
def physical_device(options_driver: Driver, mock_transport) -> PhysicalDevice:
    return PhysicalDevice.from_base(
        DeviceBase(id=_DEVICE_ID, name="Test Thermostat", config={}),
        transport=mock_transport,
        driver=options_driver,
    )


@pytest_asyncio.fixture
async def integration_app(physical_device: PhysicalDevice, admin_token_payload) -> Any:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)

    dm = DevicesService(devices={physical_device.id: physical_device})
    await dm.start()

    async def _write_device(
        device_id: str, attribute_name: str, value: Any, *, confirm: bool = True
    ) -> WriteResult:
        attr = await dm.write_device_attribute(
            device_id, attribute_name, value, confirm=confirm
        )
        return WriteResult(last_changed=attr.last_changed)

    commands_svc = CommandsService(
        storage_url=None,
        device_writer=_write_device,
        result_handler=AsyncMock(),
        target_resolver=AsyncMock(),
    )
    await commands_svc.start()

    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_commands_service] = lambda: commands_svc
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub

    yield app

    await commands_svc.stop()
    await dm.stop()


@pytest.fixture
def client(integration_app: FastAPI) -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=integration_app), base_url="http://test"
    )


class TestOptionsCodecAPIValidation:
    async def test_valid_option_returns_200(self, client: AsyncClient) -> None:
        async with client as ac:
            response = await ac.post(
                f"/{_DEVICE_ID}/commands",
                json={
                    "attribute": "mode",
                    "value": "heat",
                    "data_type": "str",
                    "confirm": False,
                },
            )
        assert response.status_code == 200

    async def test_invalid_option_returns_422(self, client: AsyncClient) -> None:
        async with client as ac:
            response = await ac.post(
                f"/{_DEVICE_ID}/commands",
                json={
                    "attribute": "mode",
                    "value": "turbo",
                    "data_type": "str",
                    "confirm": False,
                },
            )
        assert response.status_code == 422
