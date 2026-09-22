"""Conservative diagnostics for statically known write targets."""

from __future__ import annotations

from typing import TYPE_CHECKING

from automations.models import AutomationDiagnostic
from models.conditions import scalar_equal
from models.expressions import DeviceAttributeRef

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from automations.models import Automation, AutomationWrite
    from automations.protocols import ActionProvider


async def describe_writes(
    automation: Automation, providers: Mapping[str, ActionProvider]
) -> list[AutomationWrite]:
    result = []
    for branch in automation.branches:
        provider = providers.get(branch.action.provider_id)
        if provider is not None:
            result.extend(
                await provider.describe_writes(branch.action.params, automation.trigger)
            )
    return result


async def diagnose(
    automation: Automation,
    others: Sequence[Automation],
    providers: Mapping[str, ActionProvider],
) -> list[AutomationDiagnostic]:
    """Warn about direct feedback and opposing writes; conditions may be exclusive.

    These are potential conflicts, never proof that two rules will both run.
    Computed values and dynamically resolved targets are deliberately omitted.
    """
    own = await describe_writes(automation, providers)
    diagnostics = []
    for write in own:
        target = DeviceAttributeRef(
            device_id=write.device_id, attribute=write.attribute
        )
        if automation.trigger.provider_id == "change_event" and all(
            automation.trigger.params.get(key) == value
            for key, value in target.model_dump().items()
        ):
            diagnostics.append(
                AutomationDiagnostic(code="direct_feedback", target=target)
            )
    for other in others:
        if other.id == automation.id or not other.enabled:
            continue
        for write in await describe_writes(other, providers):
            for candidate in own:
                if (
                    candidate.device_id == write.device_id
                    and candidate.attribute == write.attribute
                    and candidate.value is not None
                    and write.value is not None
                    and not scalar_equal(candidate.value, write.value)
                ):
                    diagnostic = AutomationDiagnostic(
                        code="potential_write_conflict",
                        target=DeviceAttributeRef(
                            device_id=write.device_id, attribute=write.attribute
                        ),
                        other_automation_id=other.id,
                    )
                    if diagnostic not in diagnostics:
                        diagnostics.append(diagnostic)
    return diagnostics
