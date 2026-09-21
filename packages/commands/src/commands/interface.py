from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from models.types import SortOrder

if TYPE_CHECKING:
    from datetime import datetime

    from commands.models import (
        AttributeWrite,
        BatchCommandDispatch,
        CommandTemplate,
        CommandTemplateCreate,
        CommandTemplatePatch,
        UnitCommand,
    )
    from models.command_confirmation import (
        ProtectionConfirmation,
        UIConfirmationContext,
    )
    from models.pagination import Page, PaginationParams
    from models.targets import DevicesFilter


class CommandsServiceInterface(Protocol):
    # -- dispatch --

    async def dispatch_unit(  # noqa: PLR0913
        self,
        *,
        device_id: str,
        write: AttributeWrite,
        user_id: str,
        confirm: bool = True,
        batch_id: str | None = None,
        ui_confirmation: UIConfirmationContext | None = None,
        protection_confirmation: ProtectionConfirmation | None = None,
    ) -> UnitCommand: ...

    async def dispatch_batch(  # noqa: PLR0913 -- command dispatch contract
        self,
        *,
        target: DevicesFilter,
        write: AttributeWrite,
        user_id: str,
        confirm: bool = True,
        ui_confirmations: dict[str, UIConfirmationContext] | None = None,
        protection_confirmations: dict[str, ProtectionConfirmation] | None = None,
    ) -> BatchCommandDispatch: ...

    async def dispatch_from_template(
        self,
        *,
        template_id: str,
        user_id: str,
        confirm: bool = True,
    ) -> BatchCommandDispatch: ...

    async def dispatch_template(
        self,
        *,
        template: CommandTemplate,
        user_id: str,
        confirm: bool = True,
    ) -> BatchCommandDispatch: ...

    async def get_commands(  # noqa: PLR0913
        self,
        *,
        ids: list[int] | None = None,
        batch_id: str | None = None,
        template_id: str | None = None,
        device_id: str | None = None,
        attribute: str | None = None,
        user_id: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        sort: SortOrder = SortOrder.ASC,
        pagination: PaginationParams | None = None,
    ) -> Page[UnitCommand]: ...

    # -- template CRUD --

    async def save_template(
        self, template: CommandTemplateCreate, user_id: str
    ) -> CommandTemplate: ...

    async def update_template(
        self, template_id: str, patch: CommandTemplatePatch
    ) -> CommandTemplate: ...

    async def get_template(self, template_id: str) -> CommandTemplate: ...

    async def list_templates(
        self, *, pagination: PaginationParams | None = None
    ) -> Page[CommandTemplate]: ...

    async def delete_template(self, template_id: str) -> None: ...
