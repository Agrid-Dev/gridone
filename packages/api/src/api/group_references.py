"""Cross-service references belong to the composition layer."""

from automations import AutomationsServiceInterface
from automations.models import Action

from api.targets import CompositeTargetResolver
from commands import CommandsServiceInterface
from devices_manager import DevicesServiceInterface
from models.errors import NotFoundError
from models.resource_conflict import RelatedResource
from models.targets import AttributeTarget


class GroupReferences:
    def __init__(
        self,
        dm: DevicesServiceInterface,
        commands: CommandsServiceInterface,
        automations: AutomationsServiceInterface | None = None,
    ) -> None:
        self.dm = dm
        self.commands = commands
        self.automations = automations

    async def validate_action(self, action: Action) -> None:
        if action.provider_id != "command_template":
            return
        template_id = action.params.get("template_id")
        if not isinstance(template_id, str):
            return  # The provider schema owns malformed-parameter errors.
        template = await self.commands.get_template(template_id)
        if template.target.group_id is not None:
            await CompositeTargetResolver(self.dm).resolve(
                AttributeTarget(
                    devices=template.target,
                    attribute=template.write.attribute,
                ),
                writable=True,
            )

    async def list(self, group_id: str) -> list[RelatedResource]:
        """Find disabled automations and indirect ephemeral templates too."""
        references = [
            RelatedResource(kind="command_template", id=t.id, name=t.name or t.id)
            for t in (await self.commands.list_templates()).items
            if t.target.group_id == group_id
        ]
        if self.automations is None:
            return references
        for automation in await self.automations.list():
            action = automation.action
            if action.provider_id != "command_template":
                continue
            template_id = action.params.get("template_id")
            if not isinstance(template_id, str):
                continue
            try:
                template = await self.commands.get_template(template_id)
            except NotFoundError:
                continue
            if template.target.group_id == group_id:
                references.append(
                    RelatedResource(
                        kind="automation", id=automation.id, name=automation.name
                    )
                )
        return references
