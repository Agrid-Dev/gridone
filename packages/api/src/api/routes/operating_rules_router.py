"""Administer site operating rules independently of automation execution."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field, JsonValue

from api.auth import get_current_user_id, require_permission
from api.permissions import Permission
from models.operating_rules import (
    NonBlank,
    OperatingRule,
    OperatingRuleDefinition,
    OperatingRuleRetirement,
    OperatingRuleView,
)
from operating_rules import OperatingRulesService

router = APIRouter()


def get_operating_rules_service(request: Request) -> OperatingRulesService:
    return request.app.state.operating_rules_service


ServiceDep = Annotated[OperatingRulesService, Depends(get_operating_rules_service)]
ActorDep = Annotated[str, Depends(get_current_user_id)]


class UpdateOperatingRule(OperatingRuleDefinition):
    revision: int = Field(ge=1)


class RetireOperatingRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: NonBlank
    revision: int = Field(ge=1)


class SetOperatingRuleEnabled(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool
    revision: int = Field(ge=1)


class OperatingRuleSchemas(BaseModel):
    definition: dict[str, JsonValue]
    retirement: dict[str, JsonValue]


@router.get(
    "/schema",
    dependencies=[Depends(require_permission(Permission.OPERATING_RULES_READ))],
)
async def operating_rule_schemas() -> OperatingRuleSchemas:
    return OperatingRuleSchemas(
        definition=OperatingRuleDefinition.model_json_schema(),
        retirement=RetireOperatingRule.model_json_schema(),
    )


@router.get(
    "/", dependencies=[Depends(require_permission(Permission.OPERATING_RULES_READ))]
)
async def list_operating_rules(
    service: ServiceDep, device_id: str | None = None
) -> list[OperatingRuleView]:
    return service.list_operating_rules(device_id)


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(Permission.OPERATING_RULES_WRITE))],
)
async def create_operating_rule(
    body: OperatingRuleDefinition, service: ServiceDep, actor: ActorDep
) -> OperatingRule:
    return await service.create(body, actor)


@router.get(
    "/{operating_rule_id}",
    dependencies=[Depends(require_permission(Permission.OPERATING_RULES_READ))],
)
async def get_operating_rule(
    operating_rule_id: str, service: ServiceDep
) -> OperatingRuleView:
    operating_rule = service.get(operating_rule_id)
    return OperatingRuleView(
        operating_rule=operating_rule, reasons=service.diagnose(operating_rule)
    )


@router.get(
    "/{operating_rule_id}/history",
    dependencies=[Depends(require_permission(Permission.OPERATING_RULES_READ))],
)
async def get_operating_rule_history(
    operating_rule_id: str, service: ServiceDep
) -> list[OperatingRule]:
    return await service.history(operating_rule_id)


@router.put(
    "/{operating_rule_id}",
    dependencies=[Depends(require_permission(Permission.OPERATING_RULES_WRITE))],
)
async def update_operating_rule(
    operating_rule_id: str,
    body: UpdateOperatingRule,
    service: ServiceDep,
    actor: ActorDep,
) -> OperatingRule:
    return await service.update(
        operating_rule_id,
        OperatingRuleDefinition.model_validate(body.model_dump(exclude={"revision"})),
        actor,
        body.revision,
    )


@router.post(
    "/{operating_rule_id}/retire",
    dependencies=[Depends(require_permission(Permission.OPERATING_RULES_WRITE))],
)
async def retire_operating_rule(
    operating_rule_id: str,
    body: RetireOperatingRule,
    service: ServiceDep,
    actor: ActorDep,
) -> OperatingRule:
    return await service.retire(
        operating_rule_id,
        OperatingRuleRetirement(
            reason=body.reason, actor_id=actor, retired_at=datetime.now(UTC)
        ),
        body.revision,
    )


@router.patch(
    "/{operating_rule_id}/enabled",
    dependencies=[Depends(require_permission(Permission.OPERATING_RULES_WRITE))],
)
async def set_operating_rule_enabled(
    operating_rule_id: str,
    body: SetOperatingRuleEnabled,
    service: ServiceDep,
    actor: ActorDep,
) -> OperatingRule:
    return await service.set_enabled(
        operating_rule_id, actor, body.revision, enabled=body.enabled
    )


@router.delete(
    "/{operating_rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission(Permission.OPERATING_RULES_WRITE))],
)
async def delete_operating_rule(
    operating_rule_id: str,
    revision: Annotated[int, Query(ge=1)],
    service: ServiceDep,
    actor: ActorDep,
) -> None:
    await service.delete(operating_rule_id, actor, revision)
