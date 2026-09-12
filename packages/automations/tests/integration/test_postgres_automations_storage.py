"""Persist structured group execution outcomes through a real service restart."""

import os
from datetime import UTC, datetime

import pytest
from automations.models import (
    Action,
    Automation,
    AutomationExecution,
    ExecutionStatus,
    Trigger,
)
from automations.storage.postgres import PostgresStorage

from models.action_failure import ActionFailure
from models.ids import gen_id

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set")
async def test_group_failure_survives_postgres_restart():
    assert POSTGRES_URL is not None
    storage = await PostgresStorage.from_url(POSTGRES_URL)
    await storage.start()
    automation = Automation(
        id=gen_id(),
        name="Comfort",
        action=Action(
            provider_id="command_template", params={"template_id": "template"}
        ),
        trigger=Trigger(provider_id="schedule", params={}),
    )
    await storage.create(automation)
    failure = AutomationExecution(
        id=gen_id(),
        automation_id=automation.id,
        triggered_at=datetime.now(UTC),
        status=ExecutionStatus.FAILED,
        error="No commands sent to the device group",
        error_details=ActionFailure(
            code="empty_device_group", group_id="group", group_name="East"
        ),
    )
    await storage.log_execution(failure)
    await storage.close()
    reloaded = await PostgresStorage.from_url(POSTGRES_URL)
    try:
        assert await reloaded.list_executions(automation.id) == [failure]
        await reloaded.delete(automation.id)
    finally:
        await reloaded.close()
