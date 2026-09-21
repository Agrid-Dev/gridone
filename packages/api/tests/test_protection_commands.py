"""Composition tests: real services and HTTP boundary, fake equipment IO only."""

from dataclasses import dataclass
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from cli.devices import _write_device_async
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.action_providers.commands import CommandsActionProvider
from api.app import _start_commands_service
from api.auth import get_current_token_payload, get_current_user_id
from api.exception_handlers import register_exception_handlers
from api.routes.command_router import router
from api.routes.protections_router import router as protections_router
from api.selection_commands import SelectionCommands
from commands import (
    AttributeWrite,
    CommandsService,
    CommandStatus,
    CommandTemplateCreate,
)
from devices_manager import DevicesService
from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.types import TransportProtocols
from models.errors import WriteRejectedError
from models.protections import ProtectionDefinition
from models.targets import DevicesFilter
from models.types import DataType
from models.write_rules import WriteReason
from protections import ProtectionsService
from timeseries import TimeSeriesService

pytestmark = pytest.mark.asyncio


@dataclass
class Harness:
    dm: DevicesService
    protections: ProtectionsService
    commands: CommandsService
    transport: HTTPTransportClient
    client: AsyncClient
    definition: ProtectionDefinition
    rule_id: str


@pytest_asyncio.fixture
async def harness(admin_token_payload):
    transport = HTTPTransportClient(
        TransportMetadata(id="transport", name="Test equipment"), HttpTransportConfig()
    )
    transport.read = AsyncMock(return_value=False)
    transport.write = AsyncMock()
    attributes = [
        AttributeDriver(
            name="command",
            data_type=DataType.BOOL,
            read="GET localhost/command",
            write="POST localhost/command",
            codecs=[],
        ),
        AttributeDriver(
            name="running",
            data_type=DataType.BOOL,
            read="GET localhost/running",
            codecs=[],
        ),
    ]
    driver = Driver(
        metadata=DriverMetadata(id="driver"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.HTTP,
        update_strategy=UpdateStrategy(),
        attributes={attr.name: attr for attr in attributes},
    )
    devices = {
        name: CoreDevice.from_base(
            DeviceBase(id=name, name=name, config={}),
            driver=driver,
            transport=transport,
        )
        for name in ("a", "b")
    }
    dm = DevicesService(
        None,
        drivers={driver.id: driver},
        transports={transport.id: transport},
        devices=devices,
    )
    protections = ProtectionsService(None, dm.inspect_point)
    await protections.start()
    dm.set_protection_provider(protections)
    await dm.load()
    definition = ProtectionDefinition.model_validate(
        {
            "name": "Pump interlock",
            "explanation": "Keep the other pump stopped",
            "target": {"device_id": "a", "attribute": "command", "value": True},
            "condition": {
                "op": "eq",
                "left": {"device_id": "b", "attribute": "running"},
                "right": False,
            },
        }
    )
    rule = await protections.create(definition, admin_token_payload.sub)
    commands = await _start_commands_service(
        None, dm, AsyncMock(spec=TimeSeriesService)
    )
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router, prefix="/devices")
    app.include_router(protections_router, prefix="/protections")
    app.state.device_manager = dm
    app.state.commands_service = commands
    app.state.protections_service = protections
    app.state.selection_commands = SelectionCommands(dm, commands)
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield Harness(dm, protections, commands, transport, client, definition, rule.id)
    await commands.stop()
    await dm.stop()
    await protections.stop()


async def observe(harness, value):
    harness.transport.read.return_value = value
    await harness.dm.refresh_device_attribute("b", "running")
    harness.transport.read.reset_mock()


async def test_preview_and_execution_reject_without_io_and_audit(harness):
    await observe(harness, value=True)
    body = {"attribute": "command", "value": True, "confirm": False}
    preview = await harness.client.post("/devices/a/commands/preview", json=body)
    response = await harness.client.post("/devices/a/commands", json=body)
    assert response.status_code == 422
    assert [
        WriteReason.model_validate(reason) for reason in response.json()["reasons"]
    ] == [WriteReason.model_validate(reason) for reason in preview.json()["reasons"]]
    assert response.json()["reasons"][0]["code"] == "protection_blocked"
    command = (await harness.commands.get_commands()).items[0]
    assert command.status == CommandStatus.ERROR
    assert command.executed_at is None
    assert command.validation.reasons[0].protection_id == harness.rule_id
    harness.transport.write.assert_not_called()
    harness.transport.read.assert_not_called()


async def test_human_unknown_confirmation_is_bound_single_use_and_audited(harness):
    body = {"attribute": "command", "value": True, "confirm": False}
    preview = (
        await harness.client.post("/devices/a/commands/preview", json=body)
    ).json()
    assert preview["protection_confirmation_required"]
    assert not preview["eligible"]
    assert (
        await harness.client.post("/devices/a/commands", json=body)
    ).status_code == 422
    confirmed = {
        **body,
        "acknowledge_unknown_protections": True,
        "ui_confirmation_token": preview["confirmation_token"],
    }
    response = await harness.client.post("/devices/a/commands", json=confirmed)
    assert response.status_code == 200, response.text
    evidence = response.json()["validation"]["protection_confirmation"]
    assert evidence["protection_ids"] == [harness.rule_id]
    assert evidence["actor_id"] == response.json()["user_id"]
    assert response.json()["validation"]["warnings"][0]["code"] == "protection_unknown"
    assert (
        await harness.client.post("/devices/a/commands", json=confirmed)
    ).status_code == 409
    harness.transport.write.assert_awaited_once()
    harness.transport.read.assert_not_called()


async def test_confirmation_requires_a_preview_and_cannot_override_known_denial(
    harness,
):
    body = {"attribute": "command", "value": True, "confirm": False}
    invalid = await harness.client.post(
        "/devices/a/commands", json={**body, "acknowledge_unknown_protections": True}
    )
    assert invalid.status_code == 422
    preview = (
        await harness.client.post("/devices/a/commands/preview", json=body)
    ).json()
    await observe(harness, value=True)
    response = await harness.client.post(
        "/devices/a/commands",
        json={
            **body,
            "ui_confirmation_token": preview["confirmation_token"],
            "acknowledge_unknown_protections": True,
        },
    )
    assert response.status_code == 409
    harness.transport.write.assert_not_called()


@pytest.mark.parametrize("change", ["state", "definition", "retirement"])
async def test_group_confirmation_rejects_state_or_rule_changes(harness, change):
    await observe(harness, value=False)
    preview = (
        await harness.client.post(
            "/devices/commands/preview",
            json={"target": {"ids": ["a"]}, "attribute": "command", "value": True},
        )
    ).json()
    if change == "state":
        await observe(harness, value=True)
    elif change == "definition":
        await harness.protections.update(
            harness.rule_id,
            harness.definition.model_copy(update={"explanation": "Changed reason"}),
            "admin",
            1,
        )
    else:
        response = await harness.client.post(
            f"/protections/{harness.rule_id}/retire",
            json={"reason": "Wiring removed", "revision": 1},
        )
        assert response.status_code == 200
    response = await harness.client.post(
        "/devices/commands/confirm",
        json={"token": preview["token"], "device_ids": ["a"]},
    )
    assert response.status_code == 409
    harness.transport.write.assert_not_called()


async def test_automatic_and_group_members_are_terminally_refused(harness):
    template = await harness.commands.save_template(
        CommandTemplateCreate(
            target=DevicesFilter(ids=["a", "b"]),
            write=AttributeWrite(
                attribute="command", value=True, data_type=DataType.BOOL
            ),
            name="Start pumps",
        ),
        "admin",
    )
    batch_id = await CommandsActionProvider(harness.commands).execute(
        {"template_id": template.id}
    )
    await harness.commands.stop()
    # Inspect the real command history before the service's memory backend is discarded.
    rows = (await harness.commands.get_commands(batch_id=batch_id)).items
    a = next(row for row in rows if row.device_id == "a")
    b = next(row for row in rows if row.device_id == "b")
    assert a.status == CommandStatus.ERROR
    assert a.validation.reasons[0].code == "protection_unknown"
    assert a.validation.protection_confirmation is None
    assert b.status == CommandStatus.SUCCESS
    harness.transport.write.assert_awaited_once()


async def test_cli_direct_path_uses_the_same_guard(harness):
    with pytest.raises(WriteRejectedError) as error:
        await _write_device_async(harness.dm, "a", "command", "true")
    assert error.value.reasons[0].code == "protection_unknown"
    harness.transport.write.assert_not_called()
    harness.transport.read.assert_not_called()


async def test_group_unknown_acknowledgement_is_recorded_per_member(harness):
    harness.transport.read.return_value = True  # command readback only
    preview = (
        await harness.client.post(
            "/devices/commands/preview",
            json={"target": {"ids": ["a"]}, "attribute": "command", "value": True},
        )
    ).json()
    response = await harness.client.post(
        "/devices/commands/confirm",
        json={
            "token": preview["token"],
            "device_ids": ["a"],
            "acknowledge_unknown_protections": True,
        },
    )
    assert response.status_code == 202, response.text
    await harness.commands.stop()
    recorded = (
        await harness.commands.get_commands(batch_id=response.json()["batch_id"])
    ).items[0]
    assert recorded.status == CommandStatus.SUCCESS
    assert recorded.validation.protection_confirmation.protection_ids == [
        harness.rule_id
    ]


async def test_confirmation_cannot_be_replayed_for_another_write(harness):
    body = {"attribute": "command", "value": True, "confirm": False}
    preview = (
        await harness.client.post("/devices/a/commands/preview", json=body)
    ).json()
    response = await harness.client.post(
        "/devices/a/commands",
        json={
            **body,
            "value": False,
            "ui_confirmation_token": preview["confirmation_token"],
            "acknowledge_unknown_protections": True,
        },
    )
    assert response.status_code == 409
    harness.transport.write.assert_not_called()


async def test_rule_crud_and_broken_point_diagnostics(harness):
    listing = (await harness.client.get("/protections/")).json()
    assert listing[0]["reasons"] == []
    created = await harness.client.post(
        "/protections/", json=harness.definition.model_dump(mode="json")
    )
    assert created.status_code == 201
    assert created.json()["max_age_seconds"] is None
    id_ = created.json()["id"]
    updated = await harness.client.put(
        f"/protections/{id_}",
        json={
            **harness.definition.model_dump(mode="json"),
            "revision": 1,
            "name": "Updated",
            "max_age_seconds": 120,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2
    assert updated.json()["max_age_seconds"] == 120
    history = (await harness.client.get(f"/protections/{id_}/history")).json()
    assert [revision["max_age_seconds"] for revision in history] == [None, 120]
    await harness.dm.delete_device("b")
    view = (await harness.client.get(f"/protections/{id_}")).json()
    assert view["reasons"][0]["code"] == "protection_reference_invalid"
    assert not harness.dm.preview_device_write("a", "command", value=True).eligible


async def test_device_protections_filter_and_form_schemas(harness):
    schemas = await harness.client.get("/protections/schema")
    assert schemas.status_code == 200
    assert schemas.json()["definition"] == ProtectionDefinition.model_json_schema()
    assert "reason" in schemas.json()["retirement"]["required"]
    matching = await harness.client.get("/protections/", params={"device_id": "a"})
    assert [view["protection"]["id"] for view in matching.json()] == [harness.rule_id]
    # Referenced devices are not targets of this rule.
    unrelated = await harness.client.get("/protections/", params={"device_id": "b"})
    assert unrelated.json() == []


@pytest.mark.parametrize("max_age_seconds", [0, -1])
async def test_http_rejects_invalid_freshness_duration(harness, max_age_seconds):
    response = await harness.client.post(
        "/protections/",
        json={
            **harness.definition.model_dump(mode="json"),
            "max_age_seconds": max_age_seconds,
        },
    )
    assert response.status_code == 422
    assert len(harness.protections.list_protections()) == 1
