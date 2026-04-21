from datetime import UTC, datetime

import pytest
from devices_manager import DevicesManager, VirtualDevice
from devices_manager.core.device import Attribute, CoreDevice, FaultAttribute
from devices_manager.types import AttributeValueType, DataType
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from models.types import Severity

from api.dependencies import (
    get_current_token_payload,
    get_current_user_id,
    get_device_manager,
)
from api.exception_handlers import register_exception_handlers
from api.routes.devices_router import router as devices_router
from api.routes.faults_router import router as faults_router

pytestmark = pytest.mark.asyncio

CHILLER_ID = "chiller-1"
BOILER_ID = "boiler-1"
SENSOR_ID = "sensor-1"


def _fault_attr(  # noqa: PLR0913
    name: str,
    *,
    current_value: AttributeValueType,
    healthy_values: list[AttributeValueType],
    severity: Severity,
    last_updated: datetime,
    last_changed: datetime,
) -> FaultAttribute:
    return FaultAttribute(
        name=name,
        data_type=DataType.STRING,
        read_write_modes={"read"},
        current_value=current_value,
        last_updated=last_updated,
        last_changed=last_changed,
        severity=severity,
        healthy_values=healthy_values,
    )


@pytest.fixture
def devices() -> dict[str, CoreDevice]:
    # chiller: faulty ALERT, most recently updated
    chiller = VirtualDevice(
        id=CHILLER_ID,
        name="Chiller #1",
        attributes={
            "alarm": _fault_attr(
                "alarm",
                current_value="critical",
                healthy_values=["ok"],
                severity=Severity.ALERT,
                last_updated=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
                last_changed=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
            ),
        },
    )
    # boiler: faulty WARNING, older update
    boiler = VirtualDevice(
        id=BOILER_ID,
        name="Boiler #1",
        attributes={
            "status": _fault_attr(
                "status",
                current_value="error",
                healthy_values=["nominal"],
                severity=Severity.WARNING,
                last_updated=datetime(2026, 4, 20, 10, 0, tzinfo=UTC),
                last_changed=datetime(2026, 4, 20, 10, 0, tzinfo=UTC),
            ),
        },
    )
    # sensor: healthy FaultAttribute (current_value matches healthy list)
    sensor = VirtualDevice(
        id=SENSOR_ID,
        name="Sensor #1",
        attributes={
            "status": _fault_attr(
                "status",
                current_value="ok",
                healthy_values=["ok"],
                severity=Severity.INFO,
                last_updated=datetime(2026, 4, 20, 11, 0, tzinfo=UTC),
                last_changed=datetime(2026, 4, 20, 11, 0, tzinfo=UTC),
            ),
            "reading": Attribute.create("reading", DataType.FLOAT, {"read"}, value=1.0),
        },
    )
    return {CHILLER_ID: chiller, BOILER_ID: boiler, SENSOR_ID: sensor}


@pytest.fixture
def integration_app(
    devices: dict[str, CoreDevice],
    admin_token_payload,
) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(faults_router, prefix="/faults")
    app.include_router(devices_router, prefix="/devices")
    dm = DevicesManager(devices=devices, drivers={}, transports={})
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def client(integration_app: FastAPI) -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=integration_app), base_url="http://test"
    )


class TestListFaults:
    async def test_returns_only_faulty_sorted_desc(self, client: AsyncClient):
        async with client as ac:
            response = await ac.get("/faults/")
        assert response.status_code == 200
        body = response.json()
        assert [f["device_id"] for f in body] == [CHILLER_ID, BOILER_ID]
        assert body[0]["severity"] == "alert"
        assert body[1]["severity"] == "warning"

    async def test_filter_by_severity(self, client: AsyncClient):
        async with client as ac:
            response = await ac.get("/faults/", params={"severity": "alert"})
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["device_id"] == CHILLER_ID

    async def test_filter_by_device_id(self, client: AsyncClient):
        async with client as ac:
            response = await ac.get("/faults/", params={"device_id": BOILER_ID})
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["device_id"] == BOILER_ID
        assert body[0]["attribute_name"] == "status"

    async def test_filter_device_without_faults_returns_empty(
        self, client: AsyncClient
    ):
        async with client as ac:
            response = await ac.get("/faults/", params={"device_id": SENSOR_ID})
        assert response.status_code == 200
        assert response.json() == []

    async def test_unknown_device_returns_404(self, client: AsyncClient):
        async with client as ac:
            response = await ac.get("/faults/", params={"device_id": "unknown"})
        assert response.status_code == 404


class TestDeviceIsFaultyRollUp:
    async def test_devices_list_exposes_is_faulty(self, client: AsyncClient):
        async with client as ac:
            response = await ac.get("/devices/")
        assert response.status_code == 200
        body = response.json()
        by_id = {d["id"]: d for d in body}
        assert by_id[CHILLER_ID]["is_faulty"] is True
        assert by_id[BOILER_ID]["is_faulty"] is True
        assert by_id[SENSOR_ID]["is_faulty"] is False
