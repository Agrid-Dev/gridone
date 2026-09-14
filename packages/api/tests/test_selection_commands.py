import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

from api import selection_commands
from api.schemas.command import DevicesFilterBody
from api.selection_commands import (
    SelectionCommandConfirm,
    SelectionCommandPrepare,
    SelectionCommands,
)
from commands import BatchCommandDispatch, CommandsServiceInterface
from devices_manager import DevicesServiceInterface
from devices_manager.core.device import Attribute
from devices_manager.core.write_preview import DeviceWritePreview
from devices_manager.dto import Device
from models.errors import InvalidError, NotFoundError
from models.resource_conflict import ResourceConflictError
from models.types import DataType

pytestmark = pytest.mark.asyncio


@pytest.fixture
def context():
    devices = [
        Device(
            id=id_,
            name=id_,
            driver_id="driver",
            transport_id="t",
            config={},
            tags={"loop": ["east"]},
            attributes={
                "setpoint": Attribute.create(
                    "setpoint", DataType.FLOAT, {"read", "write"}, value=20
                )
            },
        )
        for id_ in ("a", "b")
    ]
    dm = MagicMock(spec=DevicesServiceInterface)
    dm.mutation_lock = asyncio.Lock()

    def matches(device, **kwargs: Any) -> bool:
        return (
            (kwargs.get("ids") is None or device.id in kwargs["ids"])
            and (
                kwargs.get("driver_id") is None
                or device.driver_id == kwargs["driver_id"]
            )
            and all(
                set(device.tags.get(key, [])).intersection(values)
                for key, values in (kwargs.get("tags") or {}).items()
            )
        )

    dm.list_devices.side_effect = lambda **kwargs: [
        device for device in devices if matches(device, **kwargs)
    ]
    dm.get_device.side_effect = lambda id_: next(d for d in devices if d.id == id_)
    dm.preview_device_write.side_effect = lambda id_, _attribute, _value: (
        DeviceWritePreview(device_id=id_, name=id_, current_value=20, eligible=True)
    )
    commands = AsyncMock(spec=CommandsServiceInterface)
    commands.dispatch_batch.return_value = BatchCommandDispatch(
        batch_id="batch", commands=[]
    )
    return SelectionCommands(dm, commands), dm, commands, devices


def prepare(coordinator, **kwargs: Any):
    return coordinator.prepare(
        SelectionCommandPrepare(
            target=DevicesFilterBody(tags={"loop": ["east"]}, driver_id="driver"),
            attribute="setpoint",
            value=25,
            **kwargs,
        ),
        "operator",
    )


async def test_preview_is_read_only_and_reports_ineligible_members(context):
    coordinator, dm, commands, _ = context
    dm.preview_device_write.side_effect = lambda id_, *_args: DeviceWritePreview(
        device_id=id_,
        name=id_,
        current_value=None,
        eligible=id_ == "a",
        reason="constraints" if id_ == "b" else None,
    )
    preview = prepare(coordinator)
    assert [row.eligible for row in preview.members] == [True, False]
    assert preview.members[1].reason == "constraints"
    commands.dispatch_batch.assert_not_awaited()


async def test_confirmation_freezes_ids_and_is_idempotent_under_double_click(context):
    coordinator, _, commands, devices = context
    preview = prepare(coordinator)
    devices.append(devices[0].model_copy(update={"id": "c"}))
    body = SelectionCommandConfirm(token=preview.token, device_ids=["a", "a"])
    first, second = await asyncio.gather(
        coordinator.confirm(body, "operator"), coordinator.confirm(body, "operator")
    )
    assert first == second
    commands.dispatch_batch.assert_awaited_once()
    kwargs = commands.dispatch_batch.call_args.kwargs
    assert kwargs["target"].ids == ["a"]
    assert kwargs["target"].tags is None
    assert kwargs["write"].value == 25
    assert kwargs["confirm"] is True


@pytest.mark.parametrize(
    "change", ["removed_tag", "deleted", "driver", "attribute_type", "ineligible"]
)
async def test_changed_recipient_requires_new_preview(context, change):
    coordinator, dm, commands, devices = context
    preview = prepare(coordinator)
    if change == "removed_tag":
        devices[0].tags = {}
    elif change == "deleted":
        devices.pop(0)
    elif change == "driver":
        devices[0].driver_id = "other"
    elif change == "attribute_type":
        devices[0].attributes["setpoint"].data_type = DataType.INT
    else:
        dm.preview_device_write.return_value = None
        dm.preview_device_write.side_effect = lambda id_, *_args: DeviceWritePreview(
            device_id=id_,
            name=id_,
            eligible=False,
            reason="constraints",
            current_value=20,
        )
    with pytest.raises(ResourceConflictError, match="preview"):
        await coordinator.confirm(
            SelectionCommandConfirm(token=preview.token, device_ids=["a"]), "operator"
        )
    commands.dispatch_batch.assert_not_awaited()


async def test_preview_is_bound_to_user(context):
    coordinator, _, commands, _ = context
    preview = prepare(coordinator)
    with pytest.raises(NotFoundError):
        await coordinator.confirm(
            SelectionCommandConfirm(token=preview.token, device_ids=["a"]), "other"
        )
    commands.dispatch_batch.assert_not_awaited()


async def test_unpreviewed_recipient_is_refused(context):
    coordinator, _, commands, _ = context
    preview = prepare(coordinator, device_ids=["a"])
    with pytest.raises(InvalidError):
        await coordinator.confirm(
            SelectionCommandConfirm(token=preview.token, device_ids=["b"]), "operator"
        )
    commands.dispatch_batch.assert_not_awaited()


async def test_empty_selection_is_invalid():
    with pytest.raises(ValidationError):
        SelectionCommandConfirm(token="token", device_ids=[])


async def test_expired_preview_cannot_dispatch(context, monkeypatch):
    coordinator, _, commands, _ = context
    preview = prepare(coordinator)
    monkeypatch.setattr(selection_commands, "PREVIEW_TTL_SECONDS", -1)
    with pytest.raises(ResourceConflictError):
        await coordinator.confirm(
            SelectionCommandConfirm(token=preview.token, device_ids=["a"]), "operator"
        )
    commands.dispatch_batch.assert_not_awaited()


async def test_failed_dispatch_is_never_repeated_with_same_token(context):
    coordinator, _, commands, _ = context
    preview = prepare(coordinator)
    commands.dispatch_batch.side_effect = RuntimeError("failed")
    body = SelectionCommandConfirm(token=preview.token, device_ids=["a"])
    with pytest.raises(RuntimeError):
        await coordinator.confirm(body, "operator")
    with pytest.raises(ResourceConflictError):
        await coordinator.confirm(body, "operator")
    commands.dispatch_batch.assert_awaited_once()


async def test_preview_cache_is_bounded(context, monkeypatch):
    coordinator, _, _, _ = context
    monkeypatch.setattr(selection_commands, "MAX_PREVIEWS", 1)
    first = prepare(coordinator)
    prepare(coordinator)
    with pytest.raises(ResourceConflictError):
        await coordinator.confirm(
            SelectionCommandConfirm(token=first.token, device_ids=["a"]), "operator"
        )


@pytest.mark.parametrize(
    ("ids", "expected"), [(None, ["a", "b"]), ([], []), (["a"], ["a"])]
)
async def test_preview_subset_preserves_empty_ids(context, ids, expected):
    coordinator, _, _, _ = context
    preview = prepare(coordinator, device_ids=ids)
    assert [row.device_id for row in preview.members] == expected


async def test_snapshot_is_detached_from_returned_preview(context):
    coordinator, _, commands, _ = context
    preview = prepare(coordinator)
    preview.value = 99
    assert preview.target.tags is not None
    preview.target.tags.clear()
    await coordinator.confirm(
        SelectionCommandConfirm(token=preview.token, device_ids=["a"]), "operator"
    )
    assert commands.dispatch_batch.call_args.kwargs["write"].value == 25


async def test_driver_binding_is_frozen_even_without_driver_filter(context):
    coordinator, _, commands, devices = context
    preview = coordinator.prepare(
        SelectionCommandPrepare(
            target=DevicesFilterBody(tags={"loop": ["east"]}),
            attribute="setpoint",
            value=25,
        ),
        "operator",
    )
    devices[0].driver_id = "other"
    with pytest.raises(ResourceConflictError):
        await coordinator.confirm(
            SelectionCommandConfirm(token=preview.token, device_ids=["a"]), "operator"
        )
    commands.dispatch_batch.assert_not_awaited()
