from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from commands.models import CommandStatus, UnitCommandCreate
from models.types import DataType


def _make_command(  # noqa: PLR0913
    *,
    batch_id: str | None = None,
    template_id: str | None = None,
    device_id: str = "device1",
    attribute: str = "mode",
    user_id: str = "user1",
    value: Any = "auto",  # noqa: ANN401
    data_type: DataType = DataType.STRING,
    status: CommandStatus = CommandStatus.SUCCESS,
    created_at: datetime = datetime(2026, 1, 2, tzinfo=UTC),
    executed_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> UnitCommandCreate:
    return UnitCommandCreate(
        batch_id=batch_id,
        template_id=template_id,
        device_id=device_id,
        attribute=attribute,
        value=value,
        data_type=data_type,
        status=status,
        status_details=None,
        user_id=user_id,
        created_at=created_at,
        executed_at=executed_at,
        completed_at=completed_at,
    )


@pytest.fixture
def make_command():  # noqa: ANN201
    return _make_command
