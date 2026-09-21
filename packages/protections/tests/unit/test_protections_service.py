from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from models.errors import (
    ConflictError,
    InvalidError,
    NotFoundError,
    StorageConnectionError,
    StorageNotInitializedError,
    WriteRejectedError,
)
from models.protections import (
    PointDefinition,
    ProtectionDefinition,
    ProtectionRetirement,
)
from models.types import DataType
from protections.service import ProtectionsService

pytestmark = pytest.mark.asyncio


async def test_create_update_and_retirement_are_audited(service, storage, definition):
    rule = await service.create(definition, "admin")
    assert len(rule.id) == 16
    assert rule.created_by == rule.updated_by == "admin"
    assert len(rule.points) == 2
    assert service.for_target("a", "command") == [rule]
    assert service.for_target("b", "command") == []
    assert service.list_protections()[0].reasons == []
    updated = await service.update(
        rule.id, definition.model_copy(update={"name": "New name"}), "editor", 1
    )
    assert updated.revision == 2
    assert updated.updated_by == "editor"
    assert updated.created_by == "admin"
    retired = await service.retire(
        rule.id,
        ProtectionRetirement(
            reason="Wiring removed", actor_id="admin", retired_at=datetime.now(UTC)
        ),
        2,
    )
    assert retired.retirement.reason == "Wiring removed"
    assert service.for_target("a", "command") == []
    assert service.get(rule.id) == retired
    assert storage.save.await_count == 3
    storage.history.return_value = [rule, updated, retired]
    assert await service.history(rule.id) == [rule, updated, retired]


async def test_stale_or_retired_rule_cannot_be_edited(service, definition):
    rule = await service.create(definition, "admin")
    with pytest.raises(ConflictError):
        await service.update(rule.id, definition, "admin", 2)
    await service.retire(
        rule.id,
        ProtectionRetirement(
            reason="Remove", actor_id="admin", retired_at=datetime.now(UTC)
        ),
        1,
    )
    with pytest.raises(ConflictError):
        await service.update(rule.id, definition, "admin", 2)
    with pytest.raises(NotFoundError):
        service.get("missing")


@pytest.mark.parametrize(
    ("info", "code"),
    [
        (None, "protection_reference_invalid"),
        (
            PointDefinition(
                data_type=DataType.BOOL, writable=False, max_age_seconds=30
            ),
            "not_writable",
        ),
        (
            PointDefinition(
                data_type=DataType.BOOL, writable=True, max_age_seconds=None
            ),
            "protection_cadence_missing",
        ),
        (
            PointDefinition(
                data_type=DataType.STRING, writable=True, max_age_seconds=30
            ),
            "invalid_value",
        ),
    ],
)
async def test_invalid_references_rejected_without_saving(  # noqa: PLR0913 -- parametrized fixtures
    service, storage, inspector, definition, info, code
):
    inspector.return_value = info
    with pytest.raises(WriteRejectedError) as error:
        await service.create(definition, "admin")
    assert error.value.reasons[0].code == code
    storage.save.assert_not_awaited()


@pytest.mark.parametrize("failure", ["missing", "type", "cadence", "writable"])
async def test_broken_references_remain_visible(
    service, inspector, definition, failure
):
    rule = await service.create(definition, "admin")
    inspector.return_value = (
        None
        if failure == "missing"
        else PointDefinition(
            data_type=DataType.INT if failure == "type" else DataType.BOOL,
            writable=failure != "writable",
            max_age_seconds=None if failure == "cadence" else 30,
        )
    )
    view = service.list_protections()[0]
    assert view.protection == rule
    assert view.reasons[0].code == "protection_reference_invalid"
    assert service.for_target("a", "command") == [rule]


async def test_two_directions_and_defensive_copies(service, definition):
    first = await service.create(definition, "admin")
    reverse = ProtectionDefinition.model_validate(
        {
            **definition.model_dump(),
            "target": {"device_id": "b", "attribute": "command", "value": True},
            "condition": {
                "op": "eq",
                "left": {"device_id": "a", "attribute": "running"},
                "right": False,
            },
        }
    )
    second = await service.create(reverse, "admin")
    assert [view.protection.id for view in service.list_protections("a")] == [first.id]
    assert [view.protection.id for view in service.list_protections("b")] == [second.id]
    assert service.list_protections("missing") == []
    assert service.for_target("a", "command")[0].id == first.id
    assert service.for_target("b", "command")[0].id == second.id
    first.points.clear()
    assert len(service.get(first.id).points) == 2


async def test_rule_budget(service, definition, monkeypatch):
    monkeypatch.setattr("protections.service.MAX_RULES", 1)
    rule = await service.create(definition, "admin")
    await service.update(rule.id, definition, "admin", 1)
    with pytest.raises(WriteRejectedError) as error:
        await service.create(definition, "admin")
    assert error.value.reasons[0].code == "evaluation_limit"


async def test_failed_save_does_not_publish_rule(service, storage, definition):
    storage.save.side_effect = OSError("database unavailable")
    with pytest.raises(OSError, match="unavailable"):
        await service.create(definition, "admin")
    assert service.for_target("a", "command") == []


async def test_lifecycle_fails_closed(inspector, monkeypatch, storage):
    svc = ProtectionsService(None, inspector)
    with pytest.raises(StorageNotInitializedError):
        svc.for_target("a", "command")
    monkeypatch.setattr(
        "protections.service.build_storage", AsyncMock(return_value=storage)
    )
    storage.list_protections.side_effect = OSError("unavailable")
    with pytest.raises(StorageConnectionError, match="Failed to load"):
        await svc.start()
    storage.close.assert_awaited_once()
    await svc.stop()
    await svc.stop()


async def test_condition_types_and_integer_targets(service, definition):
    invalid = ProtectionDefinition.model_validate(
        {
            **definition.model_dump(),
            "condition": {
                "op": "gt",
                "left": {"device_id": "b", "attribute": "running"},
                "right": 5,
            },
        }
    )
    with pytest.raises(InvalidError):
        await service.create(invalid, "admin")


async def test_model_rejects_implicit_references_and_blank_retirement(definition):
    with pytest.raises(ValidationError, match="explicit_device_point"):
        ProtectionDefinition.model_validate(
            {
                **definition.model_dump(),
                "condition": {"op": "is_known", "value": {"attribute": "running"}},
            }
        )
    with pytest.raises(ValidationError):
        ProtectionRetirement(
            reason="  ", actor_id="admin", retired_at=datetime.now(UTC)
        )


async def test_expression_depth_is_bounded(definition):
    condition = definition.condition.model_dump()
    for _ in range(17):
        condition = {"op": "not", "condition": condition}
    with pytest.raises(ValidationError, match="protection_expression_limit"):
        ProtectionDefinition.model_validate(
            {**definition.model_dump(), "condition": condition}
        )


async def test_fractional_integer_target_is_rejected(service, inspector, definition):
    inspector.return_value = PointDefinition(
        data_type=DataType.INT, writable=True, max_age_seconds=30
    )
    payload = definition.model_dump()
    payload["target"]["value"] = 1.5
    with pytest.raises(WriteRejectedError) as error:
        await service.create(ProtectionDefinition.model_validate(payload), "admin")
    assert error.value.reasons[0].code == "invalid_value"


async def test_start_is_idempotent(service, storage):
    await service.start()
    storage.list_protections.assert_awaited_once()
