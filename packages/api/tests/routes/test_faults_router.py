from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from api.access import AccessPolicy, ScopedDeviceReads
from api.access.dependencies import get_device_reads
from api.auth import (
    get_current_permissions,
    get_current_role,
    get_current_token_payload,
    get_current_user_id,
)
from api.dependencies import get_device_manager, get_ts_service
from api.exception_handlers import register_exception_handlers
from api.routes.faults_router import router
from devices_manager import DevicesServiceInterface, FaultAttribute
from devices_manager.dto import FaultView
from devices_manager.dto.device_dto import Device
from models.errors import NotFoundError
from models.types import AttributeValueType, DataType, Severity
from timeseries import TimeSeriesService
from timeseries.domain import DataPoint, SeriesKey
from users.permissions import Permission
from users.roles import DeviceScope, DeviceSelector, Role

_FAULT_A = FaultView(
    device_id="dev-1",
    device_name="Chiller 1",
    attribute_name="alarm",
    data_type=DataType.BOOL,
    severity=Severity.ALERT,
    current_value=True,
    last_updated=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
    last_changed=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
)
_FAULT_B = FaultView(
    device_id="dev-2",
    device_name="Boiler 7",
    attribute_name="status",
    data_type=DataType.STRING,
    severity=Severity.WARNING,
    current_value="error",
    last_updated=datetime(2026, 4, 20, 11, 0, tzinfo=UTC),
    last_changed=datetime(2026, 4, 20, 11, 0, tzinfo=UTC),
)


@pytest.fixture
def dm() -> MagicMock:
    mock = MagicMock(spec=DevicesServiceInterface)
    mock.list_active_faults.return_value = [_FAULT_A, _FAULT_B]
    return mock


@pytest.fixture
def app(dm, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_permissions] = lambda: frozenset(Permission)
    app.dependency_overrides[get_current_role] = lambda: None
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


class TestListFaults:
    def test_returns_list(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert body[0]["device_id"] == "dev-1"
        assert body[0]["attribute_name"] == "alarm"
        assert body[0]["severity"] == "alert"

    def test_no_filters_passed_to_manager(self, client: TestClient, dm: MagicMock):
        client.get("/")
        dm.list_active_faults.assert_called_once_with(severity=None, device_id=None)

    def test_severity_filter_forwarded(self, client: TestClient, dm: MagicMock):
        dm.list_active_faults.return_value = [_FAULT_A]
        response = client.get("/", params={"severity": "alert"})
        assert response.status_code == 200
        dm.list_active_faults.assert_called_once_with(
            severity=Severity.ALERT, device_id=None
        )

    def test_device_id_filter_forwarded(self, client: TestClient, dm: MagicMock):
        dm.list_active_faults.return_value = [_FAULT_A]
        response = client.get("/", params={"device_id": "dev-1"})
        assert response.status_code == 200
        dm.list_active_faults.assert_called_once_with(severity=None, device_id="dev-1")

    def test_both_filters_forwarded(self, client: TestClient, dm: MagicMock):
        dm.list_active_faults.return_value = []
        client.get("/", params={"severity": "warning", "device_id": "dev-9"})
        dm.list_active_faults.assert_called_once_with(
            severity=Severity.WARNING, device_id="dev-9"
        )

    def test_empty_list(self, client: TestClient, dm: MagicMock):
        dm.list_active_faults.return_value = []
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == []

    def test_invalid_severity_rejected(self, client: TestClient):
        response = client.get("/", params={"severity": "nope"})
        assert response.status_code == 422

    def test_unknown_device_id_returns_404(self, client: TestClient, dm: MagicMock):
        dm.list_active_faults.side_effect = NotFoundError("Device not found")
        response = client.get("/", params={"device_id": "unknown"})
        assert response.status_code == 404


# Alert episodes: a real in-memory series store, devices from a mocked service.

NOW = datetime.now(UTC)

WINDOW_OPEN = FaultAttribute(
    name="window_open",
    data_type=DataType.BOOL,
    read_write_modes={"read"},
    healthy_values=[False],
    severity=Severity.WARNING,
)
FAULT_CODE = FaultAttribute(
    name="fault_code",
    data_type=DataType.INT,
    read_write_modes={"read"},
    healthy_values=[0],
    severity=Severity.ALERT,
)
ROOM_203 = Device(
    id="room-203",
    name="Chambre 203",
    type="thermostat",
    attributes={"window_open": WINDOW_OPEN, "fault_code": FAULT_CODE},
    config={},
    driver_id="thermostat",
    transport_id="mqtt",
)
PUMP = Device(
    id="pump",
    name="Pompe à chaleur",
    attributes={"fault_code": FAULT_CODE},
    config={},
    driver_id="heat_pump",
    transport_id="modbus",
)


def _ago(**delta: float) -> datetime:
    return NOW - timedelta(**delta)


@pytest_asyncio.fixture
async def ts_service() -> AsyncIterator[TimeSeriesService]:
    service = TimeSeriesService(storage_url=None)
    await service.start()
    yield service
    await service.stop()


async def _record(
    ts: TimeSeriesService,
    device: Device,
    attribute: FaultAttribute,
    points: list[tuple[datetime, AttributeValueType]],
) -> None:
    await ts.create_series(
        data_type=attribute.data_type, owner_id=device.id, metric=attribute.name
    )
    await ts.upsert_points(
        SeriesKey(owner_id=device.id, metric=attribute.name),
        [DataPoint(timestamp=moment, value=value) for moment, value in points],
    )


@pytest_asyncio.fixture
async def martinique_ts() -> AsyncIterator[TimeSeriesService]:
    """A building in Martinique, UTC-4 all year round."""
    service = TimeSeriesService(storage_url=None, default_timezone="America/Martinique")
    await service.start()
    yield service
    await service.stop()


@pytest.fixture
def devices_dm() -> MagicMock:
    mock = MagicMock(spec=DevicesServiceInterface)
    mock.list_devices.side_effect = lambda **_: [ROOM_203]
    return mock


@pytest.fixture
def episodes_app(
    devices_dm: MagicMock, ts_service: TimeSeriesService, admin_token_payload
) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_device_manager] = lambda: devices_dm
    app.dependency_overrides[get_ts_service] = lambda: ts_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_permissions] = lambda: frozenset(Permission)
    app.dependency_overrides[get_current_role] = lambda: None
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def episodes_client(episodes_app: FastAPI) -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=episodes_app), base_url="http://test"
    )


def _period(**delta: float) -> dict[str, str]:
    return {"start": _ago(**delta).isoformat(), "end": NOW.isoformat()}


@pytest.mark.asyncio
class TestListFaultEpisodes:
    async def test_lists_the_episodes_of_the_period_newest_first(
        self, episodes_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await _record(
            ts_service,
            ROOM_203,
            WINDOW_OPEN,
            [
                (_ago(hours=3), True),
                (_ago(hours=2), False),
                (_ago(minutes=30), True),
            ],
        )
        # Opened ten days ago, before the period, and closed inside it.
        await _record(
            ts_service,
            ROOM_203,
            FAULT_CODE,
            [(_ago(days=10), 3), (_ago(days=5), 0)],
        )
        async with episodes_client as ac:
            response = await ac.get("/episodes", params=_period(days=7))
        assert response.status_code == 200
        body = response.json()
        assert body["truncated"] is False
        assert [
            (e["attribute_name"], e["started_at"], e["ended_at"], e["value"])
            for e in body["episodes"]
        ] == [
            ("window_open", _iso(_ago(minutes=30)), None, True),
            ("window_open", _iso(_ago(hours=3)), _iso(_ago(hours=2)), True),
            ("fault_code", _iso(_ago(days=10)), _iso(_ago(days=5)), 3),
        ]
        assert body["episodes"][2]["device_name"] == "Chambre 203"
        assert body["episodes"][2]["device_type"] == "thermostat"
        assert body["episodes"][2]["severity"] == "alert"

    async def test_filters_by_severity(
        self, episodes_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await _record(ts_service, ROOM_203, WINDOW_OPEN, [(_ago(hours=1), True)])
        await _record(ts_service, ROOM_203, FAULT_CODE, [(_ago(hours=1), 2)])
        async with episodes_client as ac:
            response = await ac.get(
                "/episodes", params={**_period(days=1), "severity": "alert"}
            )
        assert [e["attribute_name"] for e in response.json()["episodes"]] == [
            "fault_code"
        ]

    async def test_defaults_to_the_last_seven_days(
        self, episodes_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await _record(
            ts_service,
            ROOM_203,
            WINDOW_OPEN,
            [
                (_ago(days=9), True),
                (_ago(days=8), False),
                (_ago(days=2), True),
                (_ago(days=1), False),
            ],
        )
        async with episodes_client as ac:
            response = await ac.get("/episodes")
        assert [e["started_at"] for e in response.json()["episodes"]] == [
            _iso(_ago(days=2))
        ]

    async def test_reads_last_as_a_duration_up_to_now(
        self, episodes_client: AsyncClient, ts_service: TimeSeriesService
    ):
        await _record(
            ts_service,
            ROOM_203,
            WINDOW_OPEN,
            [(_ago(hours=48), True), (_ago(hours=47), False), (_ago(hours=3), True)],
        )
        async with episodes_client as ac:
            response = await ac.get("/episodes", params={"last": "1d"})
        assert [e["started_at"] for e in response.json()["episodes"]] == [
            _iso(_ago(hours=3))
        ]

    async def test_reads_a_datetime_without_offset_in_the_building_timezone(
        self, episodes_app: FastAPI, martinique_ts: TimeSeriesService
    ):
        episodes_app.dependency_overrides[get_ts_service] = lambda: martinique_ts
        noon = datetime(2026, 10, 14, 12, 0, tzinfo=UTC)
        await _record(
            martinique_ts,
            ROOM_203,
            WINDOW_OPEN,
            [(noon, True), (noon + timedelta(minutes=30), False)],
        )
        # 08:15 to 08:20 in Martinique is 12:15 to 12:20 UTC, inside the episode.
        async with AsyncClient(
            transport=ASGITransport(app=episodes_app), base_url="http://test"
        ) as ac:
            response = await ac.get(
                "/episodes",
                params={"start": "2026-10-14T08:15:00", "end": "2026-10-14T08:20:00"},
            )
        assert [e["started_at"] for e in response.json()["episodes"]] == [_iso(noon)]

    async def test_returns_the_period_it_read(self, episodes_client: AsyncClient):
        async with episodes_client as ac:
            response = await ac.get("/episodes", params=_period(days=7))
        body = response.json()
        assert (body["start"], body["end"]) == (_iso(_ago(days=7)), _iso(NOW))

    async def test_a_fault_never_recorded_has_no_episode(
        self, episodes_client: AsyncClient
    ):
        async with episodes_client as ac:
            response = await ac.get("/episodes", params=_period(days=7))
        assert response.status_code == 200
        body = response.json()
        assert (body["episodes"], body["truncated"]) == ([], False)

    @pytest.mark.parametrize(
        "params",
        [
            pytest.param(
                {"start": NOW.isoformat(), "end": _ago(days=1).isoformat()},
                id="ends-before-it-starts",
            ),
            pytest.param({"last": "soon"}, id="unreadable-duration"),
        ],
    )
    async def test_rejects_a_period_it_cannot_read(
        self, episodes_client: AsyncClient, params: dict[str, str]
    ):
        async with episodes_client as ac:
            response = await ac.get("/episodes", params=params)
        assert response.status_code == 422

    async def test_shows_only_the_devices_the_caller_may_read(
        self,
        episodes_app: FastAPI,
        episodes_client: AsyncClient,
        devices_dm: MagicMock,
        ts_service: TimeSeriesService,
    ):
        devices_dm.list_devices.side_effect = lambda **_: [ROOM_203, PUMP]
        thermostats_only = AccessPolicy.from_role(
            Role(
                id="reception",
                name="Réception",
                permissions=[Permission.DEVICES_READ],
                scopes={
                    Permission.DEVICES_READ: [
                        DeviceScope(devices=DeviceSelector(types=["thermostat"]))
                    ]
                },
            )
        )
        episodes_app.dependency_overrides[get_device_reads] = lambda: ScopedDeviceReads(
            devices_dm, thermostats_only
        )
        await _record(ts_service, ROOM_203, FAULT_CODE, [(_ago(hours=1), 2)])
        await _record(ts_service, PUMP, FAULT_CODE, [(_ago(hours=1), 4)])
        async with episodes_client as ac:
            response = await ac.get("/episodes", params=_period(days=1))
        assert [e["device_id"] for e in response.json()["episodes"]] == ["room-203"]


def _iso(moment: datetime) -> str:
    """How the API writes a UTC datetime."""
    return moment.isoformat().replace("+00:00", "Z")
