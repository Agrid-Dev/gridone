from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from datetime import datetime

    from commands.models import WriteResult
    from models.command_confirmation import OperatingRuleConfirmation
    from models.types import AttributeValueType, DataType
    from models.write_rules import WriteEvaluation


class DeviceWriter(Protocol):
    async def __call__(
        self,
        device_id: str,
        attribute_name: str,
        value: Any,  # noqa: ANN401
        *,
        confirm: bool = True,
        operating_rule_confirmation: OperatingRuleConfirmation | None = None,
    ) -> WriteResult: ...


class CommandResultHandler(Protocol):
    async def __call__(  # noqa: PLR0913
        self,
        device_id: str,
        attribute: str,
        value: AttributeValueType,
        data_type: DataType,
        command_id: int,
        last_changed: datetime | None,
    ) -> None: ...


class CommandValidator(Protocol):
    def __call__(
        self,
        device_id: str,
        attribute: str,
        value: AttributeValueType,
        *,
        operating_rule_confirmation: OperatingRuleConfirmation | None = None,
    ) -> WriteEvaluation: ...
