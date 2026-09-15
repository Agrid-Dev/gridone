# ruff: noqa: SLF001 -- direct observation/lifecycle unit tests
import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock

import pytest

from devices_manager.core.conditions import EvaluationBudget, EvaluationContext
from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.device.command_rules import (
    evaluate_write,
    project_write_state,
)
from devices_manager.core.device.value_mapping import (
    decode_mapping,
    encode_mapping,
    project_mapping,
)
from devices_manager.core.device.watchdog import SilenceWatchdog
from devices_manager.core.driver import AttributeDriver
from devices_manager.core.driver.command_validation import validate_command_declarations
from models.command_rules import CommandRejectedError, ValueMapping
from models.errors import InvalidError


def spec(**fields: object):
    return AttributeDriver.model_validate(
        {
            "name": "target",
            "data_type": "float",
            "read": "GET /target",
            "write": "POST /target",
            **fields,
        }
    )


def rule(condition, effect="require"):
    return {
        "condition": condition,
        "effect": effect,
        "reason": {
            "code": "locked",
            "message": {"default": "Locked", "translations": {"fr": "Verrouillé"}},
        },
    }


def table(**fields: object):
    return ValueMapping.model_validate(
        {
            "entries": [
                {"code": 0, "value": 0, "selectable": False},
                {"code": 1, "value": {"attribute": "first"}},
                {"code": 2, "value": {"attribute": "second"}},
            ],
            **fields,
        }
    )


@pytest.mark.parametrize(("locked", "eligible"), [(0, True), (1, False), (None, False)])
def test_candidate_guard_is_conservative(locked, eligible):
    contract = spec(
        write_rules=[rule({"op": "eq", "left": {"attribute": "lock"}, "right": 0})]
    )
    result = evaluate_write(contract, 22, {"lock": locked}.get)
    assert result.eligible is eligible
    assert result.value == 22
    if not eligible:
        assert result.reasons[0].message is not None
        assert result.reasons[0].message.translations["fr"] == "Verrouillé"


def test_arithmetic_candidate_guard_and_warning():
    condition = {
        "op": "lte",
        "left": {"candidate": True},
        "right": {"op": "subtract", "args": [{"attribute": "ceiling"}, 2]},
    }
    contract = spec(
        write_rules=[
            rule(condition),
            rule({"op": "is_known", "value": {"attribute": "ceiling"}}, "warn"),
        ]
    )
    assert project_write_state(contract, {"ceiling": 24}.get).candidate_required
    result = evaluate_write(contract, 22, {"ceiling": 24}.get)
    assert result.eligible
    assert result.warnings
    assert not evaluate_write(contract, 23, {"ceiling": 24}.get).eligible


def test_sentinel_bypasses_unknown_bounds_but_not_guards():
    contract = spec(
        write_constraints={"minimum": {"attribute": "floor"}, "sentinels": [0]}
    )
    assert project_write_state(contract, {}.get).status == "ready"
    assert evaluate_write(contract, 0, {}.get).eligible
    assert not evaluate_write(contract, 22, {}.get).eligible


@pytest.mark.parametrize(
    ("values", "policy", "available"),
    [
        ({"first": 5, "second": 6}, "reject", True),
        ({"first": 5, "second": 5}, "reject", False),
        ({"first": 5, "second": 5}, "first", True),
        ({"first": None, "second": 5}, "first", False),
        ({"first": 5, "second": None}, "first", True),
        ({"first": 5, "second": None}, "reject", False),
    ],
)
def test_projected_mapping_agrees_with_inverse(values, policy, available):
    mapping = table(duplicates=policy)
    projected = next(
        option
        for option in project_mapping(mapping, EvaluationContext(values.get))
        if option.value == 5
    )
    assert projected.available is available
    if available:
        assert encode_mapping(mapping, 5, EvaluationContext(values.get)) == 1
    else:
        with pytest.raises(CommandRejectedError):
            encode_mapping(mapping, 5, EvaluationContext(values.get))


def test_reserved_and_terminated_entries_remain_readable():
    mapping = table(stop_value=-1)
    values = {"first": -1, "second": 8}
    assert decode_mapping(mapping, 0, EvaluationContext(values.get)) == 0
    assert decode_mapping(mapping, 2, EvaluationContext(values.get)) == 8
    with pytest.raises(CommandRejectedError):
        encode_mapping(mapping, 8, EvaluationContext(values.get))


def test_full_size_table_projects_without_quadratic_evaluation():
    contract = spec(
        value_mapping={"entries": [{"code": i, "value": i} for i in range(256)]}
    )
    state = project_write_state(contract, {}.get)
    assert state.status == "ready"
    assert state.options is not None
    assert len(state.options) == 256
    assert all(option.available for option in state.options)


@pytest.mark.parametrize(
    "fields",
    [
        {"default_value": 2.5, "data_type": "int"},
        {"default_value": 31, "write_constraints": {"maximum": 30}},
        {"default_value": 2, "write_options": [{"value": 1}]},
        {"write_constraints": {"minimum": {"attribute": "missing"}}},
        {"value_mapping": {"entries": [{"code": 1, "value": {"attribute": "target"}}]}},
    ],
)
def test_invalid_declarations_are_rejected_at_import(fields):
    with pytest.raises(InvalidError):
        validate_command_declarations([spec(**fields)])


def test_persisted_telemetry_is_not_known_and_defaults_are_not_observations(
    driver, mock_transport_client
):
    driver.attributes["temperature_setpoint"] = spec(
        name="temperature_setpoint",
        default_value=22,
        write_constraints={"minimum": {"attribute": "temperature"}},
    )
    device = CoreDevice.from_base(
        DeviceBase(id="d", name="Device", config={}),
        driver=driver,
        transport=mock_transport_client,
    )
    assert device.attributes["temperature_setpoint"].current_value is None
    assert device.attributes["temperature_setpoint"].default_value == 22
    assert not device.evaluate_attribute_write("temperature_setpoint", 22).eligible
    device._ingest_attribute("temperature", 16)
    restored = CoreDevice.from_base(
        DeviceBase(id="d", name="Device", config={}),
        driver=driver,
        transport=mock_transport_client,
        restored_attributes=device.attributes,
    )
    assert restored.attributes["temperature"].current_value == 16
    assert not restored.evaluate_attribute_write("temperature_setpoint", 22).eligible


def test_expiry_at_one_interval_keeps_last_displayed_sample(device):
    device.rebuild_attribute(
        spec(
            name="temperature_setpoint",
            write_constraints={"minimum": {"attribute": "temperature"}},
        )
    )
    now = datetime(2026, 1, 1, 10, tzinfo=UTC)
    clock = Mock(return_value=now)
    watchdog = SilenceWatchdog(
        3600, Mock(), now=clock, on_expired=device._expire_command_context
    )
    device._watchdog = watchdog
    device._ingest_attribute("temperature", 16)
    watchdog.record_data()
    clock.return_value = now + timedelta(seconds=3599)
    assert device.evaluate_attribute_write("temperature_setpoint", 22).eligible
    clock.return_value = now + timedelta(hours=1)
    assert not device.evaluate_attribute_write("temperature_setpoint", 22).eligible
    assert device.attributes["temperature"].current_value == 16
    device._ingest_attribute("temperature", 16)
    watchdog.record_data()
    assert device.evaluate_attribute_write("temperature_setpoint", 22).eligible


@pytest.mark.asyncio
async def test_guard_and_preview_never_read_transport(device, mock_transport_client):
    device.rebuild_attribute(
        spec(
            name="temperature_setpoint",
            write_constraints={"minimum": {"attribute": "temperature"}},
        )
    )
    mock_transport_client.read = AsyncMock()
    mock_transport_client.write = AsyncMock()
    assert not device.evaluate_attribute_write("temperature_setpoint", 22).eligible
    with pytest.raises(CommandRejectedError):
        await device.write_attribute_value("temperature_setpoint", 22)
    mock_transport_client.read.assert_not_called()
    mock_transport_client.write.assert_not_called()
    assert not device.attributes["temperature_setpoint"].logs.write


@pytest.mark.asyncio
async def test_unconfirmed_write_does_not_become_an_observation(
    device, mock_transport_client
):
    device._ingest_attribute("temperature_setpoint", 20)
    mock_transport_client.write = AsyncMock()
    await device.write_attribute_value("temperature_setpoint", 22, confirm=False)
    assert device.attributes["temperature_setpoint"].current_value == 20
    assert device._known_attribute_value("temperature_setpoint") is None


def test_mapping_recomputes_when_only_its_table_changes(device):
    device.rebuild_attribute(
        spec(
            name="temperature_setpoint",
            value_mapping={
                "entries": [{"code": 1, "value": {"attribute": "temperature"}}]
            },
        )
    )
    device._ingest_attribute("temperature_setpoint", 1)
    assert (
        device.attributes["temperature_setpoint"].resolution_error.code
        == "unknown_dependencies"
    )
    device._ingest_attribute("temperature", 22)
    assert device.attributes["temperature_setpoint"].current_value == 22
    device._ingest_attribute("temperature", 23)
    assert device.attributes["temperature_setpoint"].current_value == 23
    assert device.attributes["temperature_setpoint"].raw_value == 1


def test_rebuilding_a_dependency_discards_trust_without_erasing_telemetry(device):
    device._ingest_attribute("temperature", 16)
    device.rebuild_attribute(spec(name="temperature", write=None))
    assert device.attributes["temperature"].current_value == 16
    assert device._known_attribute_value("temperature") is None


def test_mapping_context_is_per_device(driver, mock_transport_client):
    driver.attributes["temperature_setpoint"] = spec(
        name="temperature_setpoint",
        value_mapping={"entries": [{"code": 1, "value": {"attribute": "temperature"}}]},
    )
    devices = [
        CoreDevice.from_base(
            DeviceBase(id=str(i), name="Device", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        for i in range(2)
    ]
    for device, value in zip(devices, (20, 25), strict=True):
        device._ingest_attribute("temperature", value)
        device._ingest_attribute("temperature_setpoint", 1)
    assert [
        device.get_attribute_value("temperature_setpoint") for device in devices
    ] == [20, 25]
    devices[0]._ingest_attribute("temperature", 21)
    assert devices[1].get_attribute_value("temperature_setpoint") == 25


def test_raw_code_change_emits_projection_even_if_both_codes_are_invalid(device):
    device.rebuild_attribute(
        spec(
            name="temperature_setpoint",
            value_mapping={"entries": [{"code": 1, "value": 22}]},
        )
    )
    device._ingest_attribute("temperature_setpoint", 7)
    callback = Mock()
    device.on_write_state_update = callback
    revision = device.write_state_revision
    device._ingest_attribute("temperature_setpoint", 8)
    callback.assert_called_once_with(device)
    assert device.write_state_revision > revision
    assert device.attributes["temperature_setpoint"].raw_value == 8
    assert (
        device.attributes["temperature_setpoint"].resolution_error.code
        == "invalid_mapping_code"
    )


@pytest.mark.asyncio
async def test_waiting_write_revalidates_after_an_earlier_write(
    device, mock_transport_client
):
    device.rebuild_attribute(
        spec(
            name="temperature_setpoint",
            write_constraints={"minimum": {"attribute": "temperature"}},
        )
    )
    device._ingest_attribute("temperature", 16)
    started, finish = asyncio.Event(), asyncio.Event()

    async def send(*_args: object) -> None:
        started.set()
        await finish.wait()

    mock_transport_client.write = AsyncMock(side_effect=send)
    first = asyncio.create_task(
        device.write_attribute_value("temperature_setpoint", 22, confirm=False)
    )
    await asyncio.wait_for(started.wait(), 2)
    second = asyncio.create_task(
        device.write_attribute_value("temperature_setpoint", 22, confirm=False)
    )
    device._ingest_attribute("temperature", 25)
    finish.set()
    await first
    with pytest.raises(CommandRejectedError):
        await second
    mock_transport_client.write.assert_awaited_once()


@pytest.mark.asyncio
async def test_mapping_change_during_confirmation_never_reports_success(
    device, mock_transport_client
):
    device.rebuild_attribute(
        spec(
            name="temperature_setpoint",
            value_mapping={
                "entries": [
                    {"code": 1, "value": {"attribute": "temperature"}},
                    {"code": 2, "value": 22},
                ]
            },
        )
    )
    device._ingest_attribute("temperature", 22)
    # The initial inverse must be deterministic despite the second entry.
    device.driver.attributes["temperature_setpoint"].value_mapping.duplicates = "first"

    async def send(*_args: object) -> None:
        device._ingest_attribute("temperature", 23)
        device._ingest_attribute("temperature_setpoint", 2)

    mock_transport_client.write = AsyncMock(side_effect=send)
    with pytest.raises(CommandRejectedError) as error:
        await device.write_attribute_value("temperature_setpoint", 22)
    assert error.value.reasons[0].code == "mapping_changed"


def test_fractional_integer_commands_are_rejected(device):
    device.rebuild_attribute(spec(name="temperature_setpoint", data_type="int"))
    assert not device.evaluate_attribute_write("temperature_setpoint", 22.5).eligible


def test_fractional_integer_mapping_is_unresolved(device):
    device.rebuild_attribute(
        spec(
            name="temperature_setpoint",
            data_type="int",
            value_mapping={
                "entries": [{"code": 1, "value": {"attribute": "temperature"}}]
            },
        )
    )
    device._ingest_attribute("temperature", 22.5)
    device._ingest_attribute("temperature_setpoint", 1)
    assert device.get_attribute_value("temperature_setpoint") is None
    assert (
        device.attributes["temperature_setpoint"].resolution_error.code
        == "invalid_mapping_value"
    )


@pytest.mark.asyncio
async def test_failed_acquisition_loses_trust_but_keeps_displayed_history(
    device, mock_transport_client
):
    device.rebuild_attribute(
        spec(
            name="temperature_setpoint",
            write_constraints={"minimum": {"attribute": "temperature"}},
        )
    )
    device._ingest_attribute("temperature", 16)
    assert device.evaluate_attribute_write("temperature_setpoint", 22).eligible
    mock_transport_client.read = AsyncMock(side_effect=TimeoutError)
    with pytest.raises(TimeoutError):
        await device.read_attribute_value("temperature")
    assert not device.evaluate_attribute_write("temperature_setpoint", 22).eligible
    assert device.get_attribute_value("temperature") == 16


def test_observation_after_expiry_gets_a_new_bounded_knowledge_window(device):
    clock = Mock(return_value=datetime(2026, 1, 1, 10, tzinfo=UTC))
    watchdog = SilenceWatchdog(
        3600, Mock(), now=clock, on_expired=device._expire_command_context
    )
    device._watchdog = watchdog
    device._ingest_attribute("temperature", 16)
    watchdog.record_data()
    clock.return_value += timedelta(hours=1)
    watchdog.expire_if_due()
    assert device._known_attribute_value("temperature") is None
    # A successful manual read is an observation, but does not restore push health.
    clock.return_value += timedelta(minutes=5)
    device._ingest_attribute("temperature", 17)
    assert device._known_attribute_value("temperature") == 17
    clock.return_value += timedelta(hours=1)
    watchdog.expire_if_due()
    assert device._known_attribute_value("temperature") is None


@pytest.mark.parametrize(
    ("locked", "reason"), [(True, "option_unavailable"), (None, "unknown_dependencies")]
)
def test_conditional_options_are_projected_and_enforced(locked, reason):
    contract = spec(
        write_options=[
            {
                "value": 22,
                "allowed_when": {
                    "op": "eq",
                    "left": {"attribute": "locked"},
                    "right": False,
                },
            }
        ]
    )
    result = evaluate_write(contract, 22, {"locked": locked}.get)
    assert not result.eligible
    assert result.reasons[0].code == reason
    state = project_write_state(contract, {"locked": locked}.get)
    assert state.options is not None
    assert not state.options[0].available
    assert state.options[0].reasons == result.reasons
    assert not evaluate_write(contract, 23, {"locked": False}.get).eligible


def test_authored_option_reason_and_candidate_are_preserved():
    contract = spec(
        write_options=[
            {
                "value": 22,
                "allowed_when": {"op": "lt", "left": {"candidate": True}, "right": 20},
                "reason": {"code": "too_high"},
            }
        ]
    )
    assert evaluate_write(contract, 22, {}.get).reasons[0].code == "too_high"


@pytest.mark.parametrize("value", [float("inf"), float("nan"), "not-a-number", True])
def test_invalid_candidate_types_are_rejected(value):
    assert evaluate_write(spec(), value, {}.get).reasons[0].code == "invalid_value"


def test_budget_exhaustion_blocks_projection_and_candidate():
    contract = spec(
        write_rules=[rule({"op": "eq", "left": {"candidate": True}, "right": 22})]
    )
    context = EvaluationContext({}.get, candidate=22, budget=EvaluationBudget(0))
    assert (
        evaluate_write(contract, 22, {}.get, context=context).reasons[0].code
        == "evaluation_limit"
    )
    contract = spec(
        write_rules=[rule({"op": "is_known", "value": {"attribute": "lock"}})]
    )
    assert (
        project_write_state(contract, {"lock": False}.get, budget=EvaluationBudget(0))
        .reasons[0]
        .code
        == "evaluation_limit"
    )
