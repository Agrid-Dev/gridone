"""What a device write may rely on, seen only through transports and public methods."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, Mock

import pytest

from devices_manager.core.device import Attribute, CoreDevice, DeviceBase
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    HealthCheck,
    UpdateStrategy,
)
from devices_manager.core.write_preview import preview_write
from devices_manager.dto import device_to_public
from devices_manager.types import AttributeValueType, TransportProtocols
from models.errors import ConfirmationError, WriteRejectedError

from ..fixtures.fake_time import fake_time


def spec(name: str, **fields: object) -> AttributeDriver:
    return AttributeDriver.model_validate(
        {
            "name": name,
            "data_type": "float",
            "read": f"GET /{name}",
            "write": f"POST /{name}",
            **fields,
        }
    )


def build_driver(*attributes: AttributeDriver) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="guarded"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.HTTP,
        update_strategy=UpdateStrategy(polling_enabled=False),
        attributes={attribute.name: attribute for attribute in attributes},
    )


def bounded_driver() -> Driver:
    return build_driver(
        spec("temperature", write=None),
        spec(
            "temperature_setpoint",
            write_constraints={"minimum": {"attribute": "temperature"}},
        ),
    )


def mapped_driver(**fields: object) -> Driver:
    return build_driver(
        spec("temperature", write=None),
        spec(
            "mode",
            value_mapping={
                "entries": [{"code": 1, "value": {"attribute": "temperature"}}]
            },
            **fields,
        ),
    )


def push_driver(interval: int) -> Driver:
    temperature = AttributeDriver.model_validate(
        {
            "name": "temperature",
            "data_type": "float",
            "read": {"topic": "/sensors/temperature"},
        }
    )
    setpoint = AttributeDriver.model_validate(
        {
            "name": "setpoint",
            "data_type": "float",
            "read": {"topic": "/sensors/setpoint"},
            "write": {"topic": "/sensors/setpoint"},
            "write_constraints": {"minimum": {"attribute": "temperature"}},
        }
    )
    return Driver(
        metadata=DriverMetadata(id="push_guarded"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.MQTT,
        update_strategy=UpdateStrategy(polling_enabled=False),
        healthcheck=HealthCheck(expected_push_interval=interval),
        attributes={a.name: a for a in (temperature, setpoint)},
    )


def make_device(
    driver: Driver,
    transport,
    restored_attributes: dict[str, Attribute] | None = None,
) -> CoreDevice:
    return CoreDevice.from_base(
        DeviceBase(id="d", name="Device", config={}),
        driver=driver,
        transport=transport,
        restored_attributes=restored_attributes,
    )


async def observe(device: CoreDevice, transport, name: str, value: object) -> None:
    """A manual read is an observation: the only way a value gets trusted here."""
    transport.read = AsyncMock(return_value=value)
    await device.read_attribute_value(name)


def eligible(device: CoreDevice, name: str, value: AttributeValueType) -> bool:
    return device.evaluate_attribute_write(name, value).eligible


@pytest.mark.asyncio
async def test_persisted_telemetry_is_displayed_but_not_trusted(mock_transport_client):
    driver = build_driver(
        spec("temperature", write=None),
        spec(
            "temperature_setpoint",
            default_value=22,
            write_constraints={"minimum": {"attribute": "temperature"}},
        ),
    )
    device = make_device(driver, mock_transport_client)
    setpoint = device.attributes["temperature_setpoint"]
    assert setpoint.current_value is None
    assert setpoint.default_value == 22  # a suggestion, not an observation
    assert not eligible(device, "temperature_setpoint", 22)
    await observe(device, mock_transport_client, "temperature", 16)
    assert eligible(device, "temperature_setpoint", 22)
    restored = make_device(
        driver, mock_transport_client, restored_attributes=device.attributes
    )
    assert restored.attributes["temperature"].current_value == 16
    assert not eligible(restored, "temperature_setpoint", 22)


@fake_time
@pytest.mark.asyncio
async def test_expiry_keeps_the_displayed_sample_and_an_observation_reopens_the_window(
    mock_push_transport_client,
):
    device = make_device(push_driver(3600), mock_push_transport_client)
    await device.start_sync()
    await mock_push_transport_client.simulate_event("/sensors/temperature", 16.0)
    await asyncio.sleep(3599)
    assert eligible(device, "setpoint", 22)
    await asyncio.sleep(2)
    assert not eligible(device, "setpoint", 22)
    assert device.get_attribute_value("temperature") == 16.0
    await mock_push_transport_client.simulate_event("/sensors/temperature", 17.0)
    assert eligible(device, "setpoint", 22)
    await asyncio.sleep(3601)
    assert not eligible(device, "setpoint", 22)
    await device.stop_sync()


@pytest.mark.asyncio
async def test_guard_and_preview_never_read_transport(mock_transport_client):
    device = make_device(bounded_driver(), mock_transport_client)
    mock_transport_client.read = AsyncMock()
    mock_transport_client.write = AsyncMock()
    assert not eligible(device, "temperature_setpoint", 22)
    assert not preview_write(device, "temperature_setpoint", 22).eligible
    with pytest.raises(WriteRejectedError):
        await device.write_attribute_value("temperature_setpoint", 22)
    mock_transport_client.read.assert_not_called()
    mock_transport_client.write.assert_not_called()
    assert not device.connection_monitor.logs("temperature_setpoint").write


@pytest.mark.asyncio
async def test_unconfirmed_write_is_not_an_observation(mock_transport_client):
    driver = build_driver(
        spec("temperature_setpoint"),
        spec(
            "fan_speed",
            write_constraints={"maximum": {"attribute": "temperature_setpoint"}},
        ),
    )
    device = make_device(driver, mock_transport_client)
    await observe(device, mock_transport_client, "temperature_setpoint", 20)
    assert eligible(device, "fan_speed", 10)
    mock_transport_client.write = AsyncMock()
    await device.write_attribute_value("temperature_setpoint", 22, confirm=False)
    assert device.get_attribute_value("temperature_setpoint") == 20
    evaluation = device.evaluate_attribute_write("fan_speed", 10)
    assert evaluation.reasons[0].code == "unknown_dependencies"


@pytest.mark.asyncio
async def test_dto_and_preview_carry_fresh_write_states(mock_transport_client):
    device = make_device(bounded_driver(), mock_transport_client)
    published = device_to_public(device).attributes["temperature_setpoint"].write_state
    assert published is not None
    assert published.status == "unknown"
    await observe(device, mock_transport_client, "temperature", 16)
    preview = preview_write(device, "temperature_setpoint", 22)
    assert preview.write_state is not None
    assert preview.write_state.status == "ready"
    assert preview.write_state.constraints is not None
    assert preview.write_state.constraints.minimum == 16
    assert device_to_public(device).write_state_revision == preview.revision


@pytest.mark.asyncio
async def test_mapping_recomputes_when_only_its_table_changes(mock_transport_client):
    device = make_device(mapped_driver(), mock_transport_client)
    await observe(device, mock_transport_client, "mode", 1)
    mode = device.attributes["mode"]
    assert mode.current_value is None
    assert mode.resolution_error is not None
    assert mode.resolution_error.code == "unknown_dependencies"
    await observe(device, mock_transport_client, "temperature", 22)
    assert mode.current_value == 22
    await observe(device, mock_transport_client, "temperature", 23)
    assert mode.current_value == 23
    assert mode.raw_value == 1
    assert mode.resolution_error is None


@pytest.mark.asyncio
async def test_mapping_context_is_per_device(mock_transport_client):
    driver = mapped_driver()
    devices = [
        CoreDevice.from_base(
            DeviceBase(id=str(i), name="Device", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        for i in range(2)
    ]
    for device, value in zip(devices, (20, 25), strict=True):
        await observe(device, mock_transport_client, "temperature", value)
        await observe(device, mock_transport_client, "mode", 1)
    assert [device.get_attribute_value("mode") for device in devices] == [20, 25]
    await observe(devices[0], mock_transport_client, "temperature", 21)
    assert devices[1].get_attribute_value("mode") == 25


@pytest.mark.asyncio
async def test_rebuilding_a_dependency_drops_trust_without_erasing_telemetry(
    mock_transport_client,
):
    driver = bounded_driver()
    device = make_device(driver, mock_transport_client)
    await observe(device, mock_transport_client, "temperature", 16)
    assert eligible(device, "temperature_setpoint", 22)
    driver.attributes["temperature"] = spec("temperature", write=None, unit="°C")
    device.rebuild_attribute("temperature")
    assert device.attributes["temperature"].current_value == 16
    assert device.attributes["temperature"].unit == "°C"
    assert not eligible(device, "temperature_setpoint", 22)


@pytest.mark.asyncio
async def test_raw_code_change_emits_projection_even_if_both_codes_are_invalid(
    mock_transport_client,
):
    driver = build_driver(
        spec("mode", value_mapping={"entries": [{"code": 1, "value": 22}]})
    )
    device = make_device(driver, mock_transport_client)
    await observe(device, mock_transport_client, "mode", 7)
    assert device.project_write_states()
    callback = Mock()
    device.on_write_state_update = callback
    revision = device.write_state_revision
    await observe(device, mock_transport_client, "mode", 8)
    callback.assert_called_once_with(device)
    assert device.project_write_states()
    assert device.write_state_revision > revision
    mode = device.attributes["mode"]
    assert mode.raw_value == 8
    assert mode.resolution_error is not None
    assert mode.resolution_error.code == "invalid_mapping_code"


@pytest.mark.asyncio
async def test_waiting_write_revalidates_after_an_earlier_write(mock_transport_client):
    device = make_device(bounded_driver(), mock_transport_client)
    await observe(device, mock_transport_client, "temperature", 16)
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
    await observe(device, mock_transport_client, "temperature", 25)
    finish.set()
    await first
    with pytest.raises(WriteRejectedError):
        await second
    mock_transport_client.write.assert_awaited_once()


@fake_time
@pytest.mark.asyncio
async def test_a_write_on_another_attribute_proceeds_while_a_confirmation_waits(
    mock_transport_client,
):
    driver = build_driver(spec("temperature_setpoint"), spec("fan_speed"))
    device = make_device(driver, mock_transport_client)
    mock_transport_client.write = AsyncMock()
    mock_transport_client.read = AsyncMock(return_value=0.0)  # never the expected value
    first = asyncio.create_task(
        device.write_attribute_value(
            "temperature_setpoint", 22, confirm=True, confirm_timeout=5
        )
    )
    await asyncio.sleep(0.1)
    mock_transport_client.write.assert_awaited_once()
    assert not first.done()
    await device.write_attribute_value("fan_speed", 1, confirm=False)
    assert mock_transport_client.write.await_count == 2
    assert not first.done()
    with pytest.raises(ConfirmationError):
        await first


@pytest.mark.asyncio
async def test_mapping_change_during_confirmation_never_reports_success(
    mock_transport_client,
):
    driver = build_driver(
        spec("temperature", write=None),
        spec(
            "mode",
            value_mapping={
                "duplicates": "first",
                "entries": [
                    {"code": 1, "value": {"attribute": "temperature"}},
                    {"code": 2, "value": 22},
                ],
            },
        ),
    )
    device = make_device(driver, mock_transport_client)
    await observe(device, mock_transport_client, "temperature", 22)

    async def send(*_args: object) -> None:
        # A refresh lands while the command is in flight: the table moved.
        await observe(device, mock_transport_client, "temperature", 23)
        mock_transport_client.read = AsyncMock(return_value=2)

    mock_transport_client.write = AsyncMock(side_effect=send)
    with pytest.raises(WriteRejectedError) as error:
        await device.write_attribute_value("mode", 22)
    assert error.value.reasons[0].code == "mapping_changed"


def test_fractional_integer_commands_are_rejected(mock_transport_client):
    device = make_device(
        build_driver(spec("fan", data_type="int")), mock_transport_client
    )
    assert not eligible(device, "fan", 22.5)


@pytest.mark.asyncio
async def test_fractional_integer_mapping_is_unresolved(mock_transport_client):
    device = make_device(mapped_driver(data_type="int"), mock_transport_client)
    await observe(device, mock_transport_client, "temperature", 22.5)
    await observe(device, mock_transport_client, "mode", 1)
    mode = device.attributes["mode"]
    assert mode.current_value is None
    assert mode.resolution_error is not None
    assert mode.resolution_error.code == "invalid_mapping_value"


@pytest.mark.asyncio
async def test_failed_acquisition_loses_trust_but_keeps_displayed_history(
    mock_transport_client,
):
    device = make_device(bounded_driver(), mock_transport_client)
    await observe(device, mock_transport_client, "temperature", 16)
    assert eligible(device, "temperature_setpoint", 22)
    mock_transport_client.read = AsyncMock(side_effect=TimeoutError)
    with pytest.raises(TimeoutError):
        await device.read_attribute_value("temperature")
    assert not eligible(device, "temperature_setpoint", 22)
    assert device.get_attribute_value("temperature") == 16


@fake_time
@pytest.mark.asyncio
async def test_a_reinterpreted_sibling_never_confirms_a_write(mock_transport_client):
    driver = build_driver(
        spec("temperature", write=None),
        spec(
            "mode",
            value_mapping={
                "entries": [
                    {"code": 1, "value": {"attribute": "temperature"}},
                    {"code": 2, "value": 30},
                ]
            },
        ),
    )
    device = make_device(driver, mock_transport_client)
    await observe(device, mock_transport_client, "temperature", 22)
    await observe(device, mock_transport_client, "mode", 1)
    mock_transport_client.write = AsyncMock()
    mock_transport_client.read = AsyncMock(side_effect=TimeoutError)
    pending = asyncio.create_task(
        device.write_attribute_value("mode", 30, confirm_timeout=5)
    )
    await asyncio.sleep(0.1)  # sent; the confirmation now waits for mode
    # The sibling moves meanwhile: the saved code now reads as the requested
    # value, but the device never reported it.
    await observe(device, mock_transport_client, "temperature", 30)
    assert device.get_attribute_value("mode") == 30  # displayed, as reinterpreted
    mock_transport_client.read = AsyncMock(side_effect=TimeoutError)
    with pytest.raises(ConfirmationError):
        await pending
