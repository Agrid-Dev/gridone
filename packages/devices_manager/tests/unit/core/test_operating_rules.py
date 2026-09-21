import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, Mock

import pytest

from devices_manager.core.conditions import EvaluationContext, EvaluationLimitError
from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.device.freshness import observation_max_age
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.core.operating_rules import OperatingRuleGuard
from devices_manager.service import DevicesService
from devices_manager.types import TransportProtocols
from models.command_confirmation import OperatingRuleConfirmation
from models.errors import InvalidError, WriteRejectedError
from models.expressions import DevicePointRef, Junction
from models.operating_rules import (
    OperatingRule,
    PointContract,
    PointDefinition,
    PointObservation,
)
from models.types import DataType
from models.write_rules import WriteEvaluation, WriteReason


def rule(target="a", source="b", identifier="rule"):
    now = datetime.now(UTC)
    return OperatingRule.model_validate(
        {
            "id": identifier,
            "name": "Interlock",
            "explanation": "Avoid simultaneous operation",
            "target": {"device_id": target, "attribute": "command", "value": True},
            "condition": {
                "op": "eq",
                "left": {"device_id": source, "attribute": "running"},
                "right": False,
            },
            "created_at": now,
            "updated_at": now,
            "created_by": "admin",
            "updated_by": "admin",
            "points": [
                PointContract(
                    device_id=target, attribute="command", data_type=DataType.BOOL
                ),
                PointContract(
                    device_id=source, attribute="running", data_type=DataType.BOOL
                ),
            ],
        }
    )


@pytest.fixture
def policy():
    provider = Mock()
    provider.for_target.return_value = [rule()]
    inspector = Mock(
        return_value=PointDefinition(
            data_type=DataType.BOOL, writable=True, max_age_seconds=30
        )
    )
    resolver = Mock(return_value=PointObservation(value=False, validity="known"))
    return (
        OperatingRuleGuard(provider, inspector, resolver),
        provider,
        inspector,
        resolver,
    )


@pytest.mark.parametrize(
    ("observation", "code"),
    [
        (PointObservation(value=False, validity="known"), None),
        (PointObservation(value=True, validity="known"), "operating_rule_blocked"),
        (PointObservation(value=False, validity="unknown"), "operating_rule_unknown"),
        (PointObservation(validity="invalid"), "operating_rule_reference_invalid"),
    ],
)
def test_cross_device_decisions(policy, observation, code):
    guard, _, _, resolver = policy
    resolver.return_value = observation
    result = guard.evaluate("a", "command", WriteEvaluation(eligible=True, value=True))
    assert result.eligible == (code is None)
    assert [reason.code for reason in result.reasons] == ([code] if code else [])
    if code:
        assert result.reasons[0].operating_rule_id == "rule"
    assert result.can_confirm_operating_rules == (code == "operating_rule_unknown")


def test_only_targeted_value_is_guarded(policy):
    guard, _, _, resolver = policy
    result = guard.evaluate("a", "command", WriteEvaluation(eligible=True, value=False))
    assert result.eligible
    resolver.assert_not_called()
    assert not guard.evaluate("a", "command", WriteEvaluation(eligible=False)).eligible


def test_target_type_drift_cannot_silently_stop_matching_a_operating_rule(policy):
    guard, _, inspector, resolver = policy
    inspector.return_value = PointDefinition(
        data_type=DataType.STRING, writable=True, max_age_seconds=30
    )
    result = guard.evaluate("a", "command", WriteEvaluation(eligible=True, value="on"))
    assert not result.eligible
    assert result.reasons[0].code == "operating_rule_reference_invalid"
    assert not result.can_confirm_operating_rules
    resolver.assert_not_called()


def test_acknowledgement_cannot_override_another_known_prohibition(policy):
    guard, provider, _, resolver = policy
    provider.for_target.return_value = [rule(), rule(source="c", identifier="second")]
    resolver.return_value = PointObservation(validity="unknown")
    before = guard.evaluate("a", "command", WriteEvaluation(eligible=True, value=True))
    confirmation = OperatingRuleConfirmation(
        binding=before.operating_rule_binding,
        operating_rule_ids=before.unknown_operating_rule_ids,
        actor_id="operator",
        confirmed_at=datetime.now(UTC),
    )
    assert guard.evaluate(
        "a", "command", WriteEvaluation(eligible=True, value=True), confirmation
    ).eligible
    resolver.side_effect = lambda point, **_kwargs: (
        PointObservation(validity="unknown")
        if point.device_id == "b"
        else PointObservation(value=True, validity="known")
    )
    refused = guard.evaluate(
        "a", "command", WriteEvaluation(eligible=True, value=True), confirmation
    )
    assert not refused.eligible
    assert refused.reasons[0].code == "operating_rule_blocked"
    assert refused.warnings[0].code == "operating_rule_unknown"
    local = guard.evaluate(
        "a",
        "command",
        WriteEvaluation(
            eligible=False, value=True, reasons=[WriteReason(code="driver_blocked")]
        ),
        confirmation,
    )
    assert not local.eligible


def test_changed_rules_and_new_unknowns_cannot_reuse_confirmation(policy):
    guard, provider, _, resolver = policy
    resolver.return_value = PointObservation(validity="unknown")
    before = guard.evaluate("a", "command", WriteEvaluation(eligible=True, value=True))
    confirmation = OperatingRuleConfirmation(
        binding=before.operating_rule_binding,
        operating_rule_ids=[],
        actor_id="operator",
        confirmed_at=datetime.now(UTC),
    )
    assert not guard.evaluate(
        "a", "command", WriteEvaluation(eligible=True, value=True), confirmation
    ).eligible
    confirmation = confirmation.model_copy(update={"operating_rule_ids": ["rule"]})
    provider.for_target.return_value = [rule().model_copy(update={"revision": 2})]
    assert not guard.evaluate(
        "a", "command", WriteEvaluation(eligible=True, value=True), confirmation
    ).eligible


@pytest.mark.parametrize("failure", ["missing", "type"])
def test_broken_reference_in_unselected_branch_is_a_hard_denial(policy, failure):
    guard, provider, inspector, _ = policy
    broken = rule()
    provider.for_target.return_value = [
        broken.model_copy(
            update={
                "condition": Junction.model_validate(
                    {
                        "op": "any",
                        "conditions": [
                            {"op": "eq", "left": True, "right": True},
                            broken.condition,
                        ],
                    }
                )
            }
        )
    ]
    inspector.return_value = (
        None
        if failure == "missing"
        else PointDefinition(
            data_type=DataType.STRING if failure == "type" else DataType.BOOL,
            writable=True,
            max_age_seconds=None,
        )
    )
    result = guard.evaluate("a", "command", WriteEvaluation(eligible=True, value=True))
    assert not result.eligible
    assert result.reasons[0].code == "operating_rule_reference_invalid"


def test_provider_failure_and_evaluation_limits_fail_closed(policy, monkeypatch):
    guard, provider, _, _ = policy
    provider.for_target.side_effect = RuntimeError("private storage path")
    result = guard.evaluate("a", "command", WriteEvaluation(eligible=True, value=True))
    assert result.reasons == [WriteReason(code="operating_rule_unavailable")]
    provider.for_target.side_effect = None
    monkeypatch.setattr("devices_manager.core.operating_rules.MAX_RULES", 0)
    assert (
        guard.evaluate("a", "command", WriteEvaluation(eligible=True, value=True))
        .reasons[0]
        .code
        == "evaluation_limit"
    )
    monkeypatch.setattr("devices_manager.core.operating_rules.MAX_RULES", 64)
    monkeypatch.setattr("devices_manager.core.operating_rules.MAX_DEVICE_OPERATIONS", 1)
    assert (
        guard.evaluate("a", "command", WriteEvaluation(eligible=True, value=True))
        .reasons[0]
        .code
        == "evaluation_limit"
    )


def build_device(identifier, transport):
    attributes = [
        AttributeDriver(
            name="command",
            data_type=DataType.BOOL,
            codecs=[],
            read="GET /command",
            write="POST /command",
        ),
        AttributeDriver(
            name="running", data_type=DataType.BOOL, read="GET /running", codecs=[]
        ),
    ]
    driver = Driver(
        metadata=DriverMetadata(id="driver"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.HTTP,
        update_strategy=UpdateStrategy(),
        attributes={attribute.name: attribute for attribute in attributes},
    )
    return CoreDevice.from_base(
        DeviceBase(id=identifier, name=identifier, config={}),
        driver=driver,
        transport=transport,
    )


@pytest.mark.asyncio
async def test_service_injects_into_preview_direct_and_registered_devices(
    mock_transport_client,
):
    a = build_device("a", mock_transport_client)
    b = build_device("b", mock_transport_client)
    provider = Mock()
    provider.for_target.side_effect = lambda identifier, name: (
        [rule()] if identifier == "a" and name == "command" else []
    )
    service = DevicesService(None, devices={"a": a, "b": b})
    service.set_operating_rule_provider(provider)
    await service.load()
    try:
        mock_transport_client.read = AsyncMock(return_value=True)
        mock_transport_client.write = AsyncMock()
        await b.read_attribute_value("running")
        mock_transport_client.read.reset_mock()
        preview = service.preview_device_write("a", "command", value=True)
        with pytest.raises(WriteRejectedError) as error:
            await service.write_device_attribute(
                "a", "command", value=True, confirm=False
            )
        assert preview.reasons == error.value.reasons
        with pytest.raises(WriteRejectedError):
            await a.write_attribute_value("command", value=True, confirm=False)
        mock_transport_client.read.assert_not_called()
        mock_transport_client.write.assert_not_called()
        assert (
            service.resolve_point(
                DevicePointRef(device_id="missing", attribute="running")
            ).validity
            == "invalid"
        )
        service.set_operating_rule_provider(provider)
        assert not service.preview_device_write("a", "command", value=True).eligible
    finally:
        await service.stop()


@pytest.mark.asyncio
async def test_two_device_starts_can_both_pass_on_old_running_observations(
    mock_transport_client,
):
    """Exhibit the promised limit: per-device locks do not reserve other devices."""
    devices = {name: build_device(name, mock_transport_client) for name in ("a", "b")}
    provider = Mock()
    provider.for_target.side_effect = lambda name, _: [
        rule(name, "b" if name == "a" else "a", name)
    ]
    service = DevicesService(None, devices=devices)
    service.set_operating_rule_provider(provider)
    await service.load()
    both_sent = asyncio.Event()
    sends = []

    async def send(*args: object) -> None:
        sends.append(args)
        if len(sends) == 2:
            both_sent.set()
        await asyncio.wait_for(both_sent.wait(), 1)

    try:
        mock_transport_client.read = AsyncMock(return_value=False)
        for device in devices.values():
            await device.read_attribute_value("running")
        mock_transport_client.write = AsyncMock(side_effect=send)
        await asyncio.gather(
            *(
                device.write_attribute_value("command", value=True, confirm=False)
                for device in devices.values()
            )
        )
        assert len(sends) == 2
    finally:
        await service.stop()


def test_external_expression_is_bounded_and_driver_rejects_it():
    reference = DevicePointRef(device_id="b", attribute="running")
    context = EvaluationContext(lambda _: None, resolve_point=lambda _: False)
    assert context.value(reference) is False
    assert EvaluationContext(lambda _: None).value(reference) is None
    context.budget.remaining = 0
    with pytest.raises(EvaluationLimitError):
        context.value(reference)
    from devices_manager.core.driver.write_validation import validate_expression

    with pytest.raises(InvalidError, match="external_device_reference"):
        validate_expression(reference, {}, None, "write_rules")


@pytest.mark.asyncio
@pytest.mark.parametrize("loss", ["stop", "read_failure", "write", "expiry"])
async def test_cross_device_trust_loss_preserves_display(
    mock_transport_client, monkeypatch, loss
):
    from types import SimpleNamespace

    from devices_manager.core.device import write_guard

    now = [0.0]
    monkeypatch.setattr(
        write_guard,
        "time",
        SimpleNamespace(monotonic=lambda: now[0], time_ns=lambda: 0),
    )
    device = build_device("b", mock_transport_client)
    mock_transport_client.read = AsyncMock(return_value=False)
    await device.read_attribute_value("command")
    if loss == "stop":
        await device.stop_sync()
    elif loss == "read_failure":
        mock_transport_client.read.side_effect = TimeoutError
        with pytest.raises(TimeoutError):
            await device.read_attribute_value("command")
    elif loss == "write":
        mock_transport_client.write = AsyncMock()
        await device.write_attribute_value("command", value=True, confirm=False)
    else:
        now[0] = 31  # two default poll intervals plus read timeout = 30s
        await device.read_attribute_value("running")  # another point cannot renew it
    assert device.known_attribute_value("command") is None
    assert device.attributes["command"].current_value is False
    assert device.observed_attribute_value("command") is (
        False if loss == "expiry" else None
    )
    assert device.observed_attribute_value("command", max_age_seconds=30) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("default_polling", [True, False])
async def test_polling_groups_use_reception_not_last_change(
    mock_transport_client, monkeypatch, default_polling
):
    from types import SimpleNamespace

    from devices_manager.core.device import write_guard

    now = [0.0]
    monkeypatch.setattr(
        write_guard,
        "time",
        SimpleNamespace(monotonic=lambda: now[0], time_ns=lambda: 0),
    )
    device = build_device("b", mock_transport_client)
    device.driver.attributes["running"].polling_group = "slow"
    device.driver.update_strategy.polling_groups = {"slow": 60}
    device.driver.update_strategy.polling_enabled = default_polling
    assert observation_max_age(device.driver, "running") == 130
    assert observation_max_age(device.driver, "command") == (
        30 if default_polling else None
    )
    mock_transport_client.read = AsyncMock(return_value=False)
    await device.read_attribute_value("running")
    changed = device.attributes["running"].last_changed
    now[0] = 120
    assert device.known_attribute_value("running") is False
    await device.read_attribute_value("running")
    assert device.attributes["running"].last_changed == changed
    now[0] = 240
    assert device.known_attribute_value("running") is False
    now[0] = 251
    assert device.known_attribute_value("running") is None


@pytest.mark.asyncio
async def test_each_operating_rule_uses_its_own_optional_age_limit(
    mock_transport_client, monkeypatch
):
    from types import SimpleNamespace

    from devices_manager.core.device import write_guard

    now = [0.0]
    monkeypatch.setattr(
        write_guard,
        "time",
        SimpleNamespace(monotonic=lambda: now[0], time_ns=lambda: 0),
    )
    a = build_device("a", mock_transport_client)
    b = build_device("b", mock_transport_client)
    b.driver.update_strategy.polling_enabled = False
    service = DevicesService(None, devices={"a": a, "b": b})
    provider = Mock()
    current = rule()
    provider.for_target.side_effect = lambda device_id, _: (
        [current] if device_id == "a" else []
    )
    service.set_operating_rule_provider(provider)
    await service.load()
    try:
        assert (
            service.preview_device_write("a", "command", value=True).reasons[0].code
            == "operating_rule_unknown"
        )
        mock_transport_client.read = AsyncMock(return_value=False)
        await b.read_attribute_value("running")
        changed = b.attributes["running"].last_changed
        now[0] = 600
        assert service.preview_device_write("a", "command", value=True).eligible
        no_limit_binding = service.operating_rule_binding("a", "command")
        current = current.model_copy(update={"max_age_seconds": 60})
        assert service.operating_rule_binding("a", "command") != no_limit_binding
        expired = service.preview_device_write("a", "command", value=True)
        assert expired.reasons[0].code == "operating_rule_unknown"
        current = current.model_copy(update={"max_age_seconds": 1200})
        assert service.preview_device_write("a", "command", value=True).eligible
        current = current.model_copy(update={"max_age_seconds": 60})
        await b.read_attribute_value("running")
        assert b.attributes["running"].last_changed == changed
        assert service.preview_device_write("a", "command", value=True).eligible
        now[0] = 660
        await b.read_attribute_value("command")
        assert (
            service.preview_device_write("a", "command", value=True).reasons[0].code
            == "operating_rule_unknown"
        )
        current = current.model_copy(update={"max_age_seconds": None})
        assert service.preview_device_write("a", "command", value=True).eligible
        mock_transport_client.read.side_effect = TimeoutError
        with pytest.raises(TimeoutError):
            await b.read_attribute_value("running")
        assert (
            service.preview_device_write("a", "command", value=True).reasons[0].code
            == "operating_rule_unknown"
        )
    finally:
        await service.stop()
