"""Find equipment dependencies without evaluating or executing an automation."""

from __future__ import annotations

from typing import TYPE_CHECKING

from automations.diagnostics import describe_writes
from automations.models import walk_branches
from models.expressions import DeviceAttributeRef, expression_nodes

if TYPE_CHECKING:
    from collections.abc import Mapping

    from automations.models import Automation
    from automations.protocols import ActionProvider


async def references_device(
    automation: Automation,
    device_id: str,
    providers: Mapping[str, ActionProvider],
) -> bool:
    """Include every branch, even disabled rules and unavailable references.

    Literal references do not require the equipment to exist. Providers resolve
    indirect writes (such as saved command templates) on demand so editing a
    template cannot leave the equipment's automation list stale.
    """
    if automation.trigger.params.get("device_id") == device_id:
        return True
    for branch, _ in walk_branches(automation.branches):
        if branch.action and branch.action.params.get("device_id") == device_id:
            return True
        if any(
            isinstance(node, DeviceAttributeRef) and node.device_id == device_id
            for _, node, _ in expression_nodes(branch.condition)
        ):
            return True
    return any(
        write.device_id == device_id
        for write in await describe_writes(automation, providers)
    )
