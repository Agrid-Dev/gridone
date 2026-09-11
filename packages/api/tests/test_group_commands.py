import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

from api import group_commands
from api.group_commands import GroupCommandConfirm, GroupCommandPrepare, GroupCommands
from commands import BatchCommandDispatch, CommandsServiceInterface
from devices_manager import DevicesServiceInterface
from devices_manager.core.device import Attribute
from devices_manager.core.device_group import DeviceGroup
from devices_manager.core.write_preview import DeviceWritePreview
from devices_manager.dto import Device
from models.errors import InvalidError, NotFoundError
from models.resource_conflict import ResourceConflictError
from models.types import DataType

pytestmark = pytest.mark.asyncio


@pytest.fixture
def context():
    group = DeviceGroup(
        id="group",
        name="East",
        driver_id="driver",
        device_ids=["a", "b"],
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    dm = MagicMock(spec=DevicesServiceInterface)
    dm.mutation_lock = asyncio.Lock()
    dm.get_group.return_value = group
    devices = [
        Device(
            id=id_,
            name=id_,
            driver_id="driver",
            transport_id="transport",
            config={},
            attributes={
                "setpoint": Attribute.create(
                    "setpoint", DataType.FLOAT, {"read", "write"}, value=20.0
                )
            },
        )
        for id_ in ("a", "b", "c")
    ]
    dm.get_device.side_effect = lambda id_: next(d for d in devices if d.id == id_)
    dm.list_devices.side_effect = lambda *, ids: [d for d in devices if d.id in ids]
    dm.preview_device_write.side_effect = lambda id_, _attribute, _value: (
        DeviceWritePreview(device_id=id_, name=id_, current_value=20.0, eligible=True)
    )
    commands = AsyncMock(spec=CommandsServiceInterface)
    commands.dispatch_batch.return_value = BatchCommandDispatch(
        batch_id="batch", commands=[]
    )
    return GroupCommands(dm, commands), dm, commands


def prepare(coordinator: GroupCommands):
    return coordinator.prepare(
        "group", GroupCommandPrepare(attribute="setpoint", value=25), "operator"
    )


async def test_preview_is_read_only_and_reports_ineligible_members(context):
    coordinator, dm, commands = context
    dm.preview_device_write.side_effect = lambda id_, _attribute, _value: (
        DeviceWritePreview(
            device_id=id_,
            name=id_,
            current_value=None,
            eligible=id_ == "a",
            reason="constraints" if id_ == "b" else None,
        )
    )
    preview = prepare(coordinator)
    assert preview.group_name == "East"
    assert [row.eligible for row in preview.members] == [True, False]
    assert preview.members[1].reason == "constraints"
    commands.dispatch_batch.assert_not_awaited()


async def test_confirmation_freezes_ids_and_is_idempotent_under_double_click(context):
    coordinator, dm, commands = context
    preview = prepare(coordinator)
    dm.get_group.return_value.device_ids.append("c")
    body = GroupCommandConfirm(token=preview.token, device_ids=["a", "a"])
    first, second = await asyncio.gather(
        coordinator.confirm("group", body, "operator"),
        coordinator.confirm("group", body, "operator"),
    )
    assert first == second
    commands.dispatch_batch.assert_awaited_once()
    kwargs = commands.dispatch_batch.call_args.kwargs
    assert kwargs["target"].ids == ["a"]
    assert kwargs["target"].group_id is None
    assert kwargs["write"].value == 25
    assert kwargs["confirm"] is True
    assert dm.get_group.return_value.device_ids == ["a", "b", "c"]


async def test_filtered_preparation_does_not_include_other_group_members(context):
    coordinator, _, _ = context
    preview = coordinator.prepare(
        "group",
        GroupCommandPrepare(attribute="setpoint", value=25, device_ids=["b"]),
        "operator",
    )
    assert [row.device_id for row in preview.members] == ["b"]


@pytest.mark.parametrize("change", ["removed", "incompatible", "ineligible", "deleted"])
async def test_changed_recipient_requires_new_preview(context, change):
    coordinator, dm, commands = context
    preview = prepare(coordinator)
    if change == "removed":
        dm.get_group.return_value.device_ids.remove("a")
    elif change == "incompatible":
        dm.get_device("a").driver_id = "different"
    elif change == "deleted":
        dm.get_device.side_effect = NotFoundError("Device missing")
    else:
        dm.preview_device_write.side_effect = lambda id_, _attribute, _value: (
            DeviceWritePreview(
                device_id=id_,
                name=id_,
                current_value=20.0,
                eligible=False,
                reason="constraints",
            )
        )
    with pytest.raises(ResourceConflictError) as error:
        await coordinator.confirm(
            "group",
            GroupCommandConfirm(token=preview.token, device_ids=["a"]),
            "operator",
        )
    assert error.value.code == "group_preview_changed"
    commands.dispatch_batch.assert_not_awaited()


@pytest.mark.parametrize(
    ("group_id", "actor"), [("other", "operator"), ("group", "someone-else")]
)
async def test_preview_is_bound_to_user_and_group(context, group_id, actor):
    coordinator, _, commands = context
    preview = prepare(coordinator)
    with pytest.raises(NotFoundError):
        await coordinator.confirm(
            group_id, GroupCommandConfirm(token=preview.token, device_ids=["a"]), actor
        )
    commands.dispatch_batch.assert_not_awaited()


async def test_unpreviewed_recipient_is_refused(context):
    coordinator, _, commands = context
    preview = prepare(coordinator)
    with pytest.raises(InvalidError):
        await coordinator.confirm(
            "group",
            GroupCommandConfirm(token=preview.token, device_ids=["c"]),
            "operator",
        )
    commands.dispatch_batch.assert_not_awaited()


async def test_empty_selection_is_invalid():
    with pytest.raises(ValidationError):
        GroupCommandConfirm(token="token", device_ids=[])


async def test_expired_preview_cannot_dispatch(context, monkeypatch):
    coordinator, _, commands = context
    monkeypatch.setattr(group_commands, "monotonic", lambda: 0)
    preview = prepare(coordinator)
    monkeypatch.setattr(group_commands, "monotonic", lambda: 1000)
    with pytest.raises(ResourceConflictError) as error:
        await coordinator.confirm(
            "group",
            GroupCommandConfirm(token=preview.token, device_ids=["a"]),
            "operator",
        )
    assert error.value.code == "group_preview_expired"
    commands.dispatch_batch.assert_not_awaited()


async def test_failed_dispatch_is_never_repeated_with_same_token(context):
    coordinator, _, commands = context
    preview = prepare(coordinator)
    commands.dispatch_batch.side_effect = OSError("storage failure")
    body = GroupCommandConfirm(token=preview.token, device_ids=["a"])
    with pytest.raises(OSError, match="storage failure"):
        await coordinator.confirm("group", body, "operator")
    with pytest.raises(ResourceConflictError):
        await coordinator.confirm("group", body, "operator")
    commands.dispatch_batch.assert_awaited_once()


async def test_preview_cache_is_bounded(context, monkeypatch):
    coordinator, _, _ = context
    monkeypatch.setattr(group_commands, "MAX_PREVIEWS", 1)
    previous = prepare(coordinator)
    prepare(coordinator)
    with pytest.raises(ResourceConflictError):
        await coordinator.confirm(
            "group",
            GroupCommandConfirm(token=previous.token, device_ids=["a"]),
            "operator",
        )


@pytest.mark.parametrize("ids", [["b"], []])
async def test_target_filter_intersection_preserves_empty_ids(context, ids):
    from api.schemas.command import DevicesFilterBody

    coordinator, _, _ = context
    preview = coordinator.prepare(
        "group",
        GroupCommandPrepare(
            attribute="setpoint",
            value=25,
            target=DevicesFilterBody(group_id="group", ids=ids),
        ),
        "operator",
    )
    assert [member.device_id for member in preview.members] == ids


async def test_preview_rejects_target_for_different_group(context):
    from api.schemas.command import DevicesFilterBody

    coordinator, _, commands = context
    with pytest.raises(InvalidError, match="requested group"):
        coordinator.prepare(
            "group",
            GroupCommandPrepare(
                attribute="setpoint",
                value=25,
                target=DevicesFilterBody(group_id="other"),
            ),
            "operator",
        )
    commands.dispatch_batch.assert_not_awaited()
