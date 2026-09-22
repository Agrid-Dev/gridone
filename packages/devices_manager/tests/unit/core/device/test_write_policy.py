"""A policy can guard any write without coupling devices to a policy domain."""

from datetime import UTC, datetime
from typing import Never
from unittest.mock import AsyncMock

import pytest

from models.command_confirmation import WriteConsent
from models.errors import WriteRejectedError
from models.write_rules import WriteEvaluation, WriteReason


@pytest.mark.asyncio
async def test_policy_receives_consent_under_write_lock(device, mock_transport_client):
    consent = WriteConsent(
        binding="maintenance-revision",
        requirement_ids=["maintenance"],
        actor_id="operator",
        confirmed_at=datetime.now(UTC),
    )
    calls = []

    def policy(device_id, attribute, evaluation, received) -> WriteEvaluation:
        calls.append((device_id, attribute, evaluation.value, received))
        assert device._write_lock.locked()  # noqa: SLF001
        return evaluation.model_copy(
            update={
                "eligible": False,
                "reasons": [WriteReason(code="maintenance")],
            }
        )

    device.write_policy = policy
    mock_transport_client.write = AsyncMock()
    with pytest.raises(WriteRejectedError) as error:
        await device.write_attribute_value(
            "temperature_setpoint", 22, confirm=False, consent=consent
        )
    assert error.value.reasons == [WriteReason(code="maintenance")]
    assert calls == [(device.id, "temperature_setpoint", 22, consent)]
    mock_transport_client.write.assert_not_called()


@pytest.mark.asyncio
async def test_policy_failure_refuses_preview_and_direct_write(
    device, mock_transport_client
):
    def broken_policy(*_: object) -> Never:
        message = "private policy implementation detail"
        raise RuntimeError(message)

    device.write_policy = broken_policy
    mock_transport_client.write = AsyncMock()
    evaluation = device.evaluate_attribute_write("temperature_setpoint", 22)
    assert not evaluation.eligible
    assert not evaluation.consent_required
    assert evaluation.reasons == [WriteReason(code="write_policy_unavailable")]
    with pytest.raises(WriteRejectedError) as error:
        await device.write_attribute_value("temperature_setpoint", 22, confirm=False)
    assert error.value.reasons == evaluation.reasons
    mock_transport_client.write.assert_not_called()
