"""Transport-independent policy invoked at the device's universal write gate."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from models.command_confirmation import WriteConsent
    from models.write_rules import WriteEvaluation


class WritePolicy(Protocol):
    def __call__(
        self,
        device_id: str,
        attribute: str,
        evaluation: WriteEvaluation,
        consent: WriteConsent | None,
    ) -> WriteEvaluation: ...
