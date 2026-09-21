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
from models.operating_rules import (
    OperatingRuleDefinition,
    OperatingRuleRetirement,
    PointDefinition,
)
from models.types import DataType
from operating_rules.service import OperatingRulesService

pytestmark = pytest.mark.asyncio


async def test_create_update_and_retirement_are_audited(service, storage, definition):
    rule = await service.create(definition, "admin")
    assert len(rule.id) == 16
    assert rule.created_by == rule.updated_by == "admin"
    assert len(rule.points) == 2
    assert service.for_target("a", "command") == [rule]
    assert service.for_target("b", "command") == []
    assert service.list_operating_rules()[0].reasons == []
    updated = await service.update(
        rule.id, definition.model_copy(update={"name": "New name"}), "editor", 1
    )
    assert updated.revision == 2
    assert updated.updated_by == "editor"
    assert updated.created_by == "admin"
    retired = await service.retire(
        rule.id,
        OperatingRuleRetirement(
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
        OperatingRuleRetirement(
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
        (None, "operating_rule_reference_invalid"),
        (
            PointDefinition(
                data_type=DataType.BOOL, writable=False, max_age_seconds=30
            ),
            "not_writable",
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


@pytest.mark.parametrize("failure", ["missing", "type", "writable"])
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
            max_age_seconds=30,
        )
    )
    view = service.list_operating_rules()[0]
    assert view.operating_rule == rule
    assert view.reasons[0].code == "operating_rule_reference_invalid"
    assert service.for_target("a", "command") == [rule]


async def test_two_directions_and_defensive_copies(service, definition):
    first = await service.create(definition, "admin")
    reverse = OperatingRuleDefinition.model_validate(
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
    assert [view.operating_rule.id for view in service.list_operating_rules("a")] == [
        first.id
    ]
    assert [view.operating_rule.id for view in service.list_operating_rules("b")] == [
        second.id
    ]
    assert service.list_operating_rules("missing") == []
    assert service.for_target("a", "command")[0].id == first.id
    assert service.for_target("b", "command")[0].id == second.id
    first.points.clear()
    assert len(service.get(first.id).points) == 2


async def test_rule_budget(service, definition, monkeypatch):
    monkeypatch.setattr("operating_rules.service.MAX_RULES", 1)
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
    svc = OperatingRulesService(None, inspector)
    with pytest.raises(StorageNotInitializedError):
        svc.for_target("a", "command")
    monkeypatch.setattr(
        "operating_rules.service.build_storage", AsyncMock(return_value=storage)
    )
    storage.list_operating_rules.side_effect = OSError("unavailable")
    with pytest.raises(StorageConnectionError, match="Failed to load"):
        await svc.start()
    storage.close.assert_awaited_once()
    await svc.stop()
    await svc.stop()


async def test_condition_types_and_integer_targets(service, definition):
    invalid = OperatingRuleDefinition.model_validate(
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
        OperatingRuleDefinition.model_validate(
            {
                **definition.model_dump(),
                "condition": {"op": "is_known", "value": {"attribute": "running"}},
            }
        )
    with pytest.raises(ValidationError):
        OperatingRuleRetirement(
            reason="  ", actor_id="admin", retired_at=datetime.now(UTC)
        )


async def test_expression_depth_is_bounded(definition):
    condition = definition.condition.model_dump()
    for _ in range(17):
        condition = {"op": "not", "condition": condition}
    with pytest.raises(ValidationError, match="operating_rule_expression_limit"):
        OperatingRuleDefinition.model_validate(
            {**definition.model_dump(), "condition": condition}
        )


async def test_fractional_integer_target_is_rejected(service, inspector, definition):
    inspector.return_value = PointDefinition(
        data_type=DataType.INT, writable=True, max_age_seconds=30
    )
    payload = definition.model_dump()
    payload["target"]["value"] = 1.5
    with pytest.raises(WriteRejectedError) as error:
        await service.create(OperatingRuleDefinition.model_validate(payload), "admin")
    assert error.value.reasons[0].code == "invalid_value"


async def test_start_is_idempotent(service, storage):
    await service.start()
    storage.list_operating_rules.assert_awaited_once()


@pytest.mark.parametrize("max_age", [None, 45])
async def test_freshness_is_independent_of_driver_cadence(
    service, inspector, definition, max_age
):
    inspector.return_value = PointDefinition(
        data_type=DataType.BOOL, writable=True, max_age_seconds=None
    )
    payload = definition.model_copy(update={"max_age_seconds": max_age})
    rule = await service.create(payload, "admin")
    assert rule.max_age_seconds == max_age
    assert service.diagnose(rule) == []
    updated = await service.update(
        rule.id, payload.model_copy(update={"max_age_seconds": 120}), "editor", 1
    )
    assert updated.max_age_seconds == 120
    assert rule.max_age_seconds == max_age
    assert updated.revision == 2


@pytest.mark.parametrize("max_age", [0, -1, float("inf"), float("nan")])
async def test_freshness_duration_must_be_positive_and_finite(definition, max_age):
    with pytest.raises(ValidationError):
        OperatingRuleDefinition.model_validate(
            {**definition.model_dump(), "max_age_seconds": max_age}
        )


async def test_missing_freshness_is_disabled_for_existing_definitions(definition):
    payload = definition.model_dump(exclude={"max_age_seconds"})
    assert OperatingRuleDefinition.model_validate(payload).max_age_seconds is None


async def test_disable_edit_reactivate_and_delete_are_audited(
    service, storage, definition
):
    rule = await service.create(definition, "admin")
    assert rule.enabled
    disabled = await service.set_enabled(rule.id, "editor", 1, enabled=False)
    assert not disabled.enabled
    assert disabled.revision == 2
    assert disabled.updated_by == "editor"
    assert service.for_target("a", "command") == []
    assert service.list_operating_rules()[0].operating_rule == disabled
    edited = await service.update(rule.id, definition, "editor", 2)
    assert not edited.enabled
    enabled = await service.set_enabled(rule.id, "admin", 3, enabled=True)
    assert service.for_target("a", "command") == [enabled]
    deleted = await service.delete(rule.id, "editor", 4)
    assert deleted.deleted_at == deleted.updated_at
    assert deleted.updated_by == "editor"
    assert deleted.revision == 5
    assert service.list_operating_rules() == []
    assert service.for_target("a", "command") == []
    with pytest.raises(NotFoundError):
        service.get(rule.id)
    with pytest.raises(NotFoundError):
        await service.set_enabled(rule.id, "admin", 5, enabled=True)
    revisions = [rule, disabled, edited, enabled, deleted]
    storage.history.return_value = revisions
    assert await service.history(rule.id) == revisions


@pytest.mark.parametrize("operation", ["disable", "enable", "delete"])
async def test_lifecycle_rejects_stale_revision(
    service, storage, definition, operation
):
    rule = await service.create(definition, "admin")
    mutation = (
        service.delete(rule.id, "admin", 2)
        if operation == "delete"
        else service.set_enabled(rule.id, "admin", 2, enabled=operation == "enable")
    )
    with pytest.raises(ConflictError):
        await mutation
    assert service.get(rule.id) == rule
    assert storage.save.await_count == 1


@pytest.mark.parametrize("operation", ["disable", "delete"])
async def test_failed_lifecycle_save_keeps_enforcement(
    service, storage, definition, operation
):
    rule = await service.create(definition, "admin")
    storage.save.side_effect = OSError("unavailable")
    mutation = (
        service.delete(rule.id, "admin", 1)
        if operation == "delete"
        else service.set_enabled(rule.id, "admin", 1, enabled=False)
    )
    with pytest.raises(OSError, match="unavailable"):
        await mutation
    assert service.for_target("a", "command") == [rule]


async def test_broken_rule_can_be_disabled_and_deleted_but_not_reactivated(
    service, inspector, definition
):
    rule = await service.create(definition, "admin")
    inspector.return_value = None
    disabled = await service.set_enabled(rule.id, "admin", 1, enabled=False)
    with pytest.raises(WriteRejectedError) as error:
        await service.set_enabled(rule.id, "admin", 2, enabled=True)
    assert error.value.reasons[0].code == "operating_rule_reference_invalid"
    assert service.get(rule.id) == disabled
    await service.delete(rule.id, "admin", 2)
    assert service.list_operating_rules() == []


async def test_activation_rechecks_active_rule_limit(service, definition, monkeypatch):
    monkeypatch.setattr("operating_rules.service.MAX_RULES", 1)
    first = await service.create(definition, "admin")
    await service.set_enabled(first.id, "admin", 1, enabled=False)
    second = await service.create(definition, "admin")
    with pytest.raises(WriteRejectedError) as error:
        await service.set_enabled(first.id, "admin", 2, enabled=True)
    assert error.value.reasons[0].code == "evaluation_limit"
    assert service.for_target("a", "command") == [second]


@pytest.mark.parametrize("operation", ["enable", "delete"])
async def test_legacy_retired_rule_can_be_reactivated_or_deleted(
    service, definition, operation
):
    rule = await service.create(definition, "admin")
    await service.retire(
        rule.id,
        OperatingRuleRetirement(
            reason="Maintenance", actor_id="admin", retired_at=datetime.now(UTC)
        ),
        1,
    )
    if operation == "enable":
        enabled = await service.set_enabled(rule.id, "admin", 2, enabled=True)
        assert enabled.retirement is None
        assert service.for_target("a", "command") == [enabled]
    else:
        await service.delete(rule.id, "admin", 2)
        assert service.list_operating_rules() == []
