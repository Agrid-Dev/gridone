import pytest

from api.app import _start_users_service

pytestmark = pytest.mark.asyncio


class TestStartUsersService:
    async def test_seeds_the_admin_from_the_setting(self):
        service = await _start_users_service(None, "configured-password")
        try:
            users = await service.list_users()
            assert [u.username for u in users] == ["admin"]
        finally:
            await service.stop()

    async def test_names_the_env_var_when_the_seed_cannot_run(self):
        """The service speaks in its own terms; the root maps it to the setting."""
        with pytest.raises(RuntimeError, match="GRIDONE_ADMIN_PASSWORD"):
            await _start_users_service(None, None)


async def test_command_composition_uses_the_guard_and_records_observations():
    from unittest.mock import AsyncMock, MagicMock, patch

    from api.app import _start_commands_service
    from commands.models import AttributeWrite
    from devices_manager import Attribute, DevicesService
    from devices_manager.core.write_preview import DeviceWritePreview
    from models.command_rules import CommandRejectedError, WriteReason
    from models.types import DataType
    from timeseries import TimeSeriesService

    dm = MagicMock(spec=DevicesService)
    dm.preview_device_write.return_value = DeviceWritePreview(
        device_id="d", name="D", current_value=21, eligible=True, value=22
    )
    dm.write_device_attribute = AsyncMock(
        return_value=Attribute.create(
            "setpoint", DataType.FLOAT, {"read", "write"}, value=22
        )
    )
    service = await _start_commands_service(None, dm, MagicMock(spec=TimeSeriesService))
    try:
        write = AttributeWrite(
            attribute="setpoint", value="22", data_type=DataType.FLOAT
        )
        with patch("api.app.record_attribute_point", new_callable=AsyncMock) as record:
            command = await service.dispatch_unit(
                device_id="d", write=write, user_id="u"
            )
            assert record.await_args is not None
            assert record.await_args.args[3] == 22
            assert record.await_args.kwargs["command_id"] == command.id
            record.reset_mock()
            await service.dispatch_unit(
                device_id="d", write=write, user_id="u", confirm=False
            )
            record.assert_not_awaited()
            dm.preview_device_write.return_value = DeviceWritePreview(
                device_id="d",
                name="D",
                current_value=22,
                eligible=False,
                reasons=[WriteReason(code="locked")],
            )
            with pytest.raises(CommandRejectedError):
                await service.dispatch_unit(device_id="d", write=write, user_id="u")
            assert dm.write_device_attribute.await_count == 2
    finally:
        await service.stop()
