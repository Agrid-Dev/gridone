from unittest.mock import AsyncMock, Mock, patch

import pytest
from xknx.dpt import DPTArray, DPTBinary
from xknx.telegram import GroupAddress, Telegram
from xknx.telegram.apci import GroupValueRead, GroupValueResponse, GroupValueWrite

from devices_manager.core.transports.knx_transport import (
    KNXAddress,
    KNXTransportClient,
    KNXTransportConfig,
)
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata

pytestmark = pytest.mark.asyncio


@pytest.fixture
def knx_config() -> KNXTransportConfig:
    return KNXTransportConfig(gateway_ip="127.0.0.1", port=3671)


@pytest.fixture
def knx_metadata() -> TransportMetadata:
    return TransportMetadata(id="knx1", name="KNX gateway")


@pytest.fixture
def mock_xknx() -> AsyncMock:
    xknx = AsyncMock()
    xknx.start = AsyncMock()
    xknx.stop = AsyncMock()
    xknx.telegrams = Mock()
    xknx.telegrams.put = AsyncMock()
    return xknx


@pytest.fixture
def knx_client(
    knx_metadata: TransportMetadata,
    knx_config: KNXTransportConfig,
    mock_xknx: AsyncMock,
):
    with patch(
        "devices_manager.core.transports.knx_transport.client.XKNX",
        return_value=mock_xknx,
    ):
        yield KNXTransportClient(knx_metadata, knx_config)


class TestConnect:
    async def test_connect_and_close(
        self,
        knx_client: KNXTransportClient,
        mock_xknx: AsyncMock,
    ) -> None:
        assert knx_client.connection_state.is_connected is False
        await knx_client.connect()
        assert knx_client.connection_state.is_connected is True
        mock_xknx.start.assert_awaited_once()
        await knx_client.close()
        mock_xknx.stop.assert_awaited_once()
        assert knx_client.connection_state.is_connected is False

    async def test_connect_idempotent(
        self,
        knx_client: KNXTransportClient,
        mock_xknx: AsyncMock,
    ) -> None:
        await knx_client.connect()
        await knx_client.connect()
        assert mock_xknx.start.await_count == 1

    async def test_connect_sets_connection_error_on_start_failure(
        self,
        knx_metadata: TransportMetadata,
        knx_config: KNXTransportConfig,
    ) -> None:
        failing_xknx = AsyncMock()
        failing_xknx.start = AsyncMock(side_effect=OSError("gateway unreachable"))

        with patch(
            "devices_manager.core.transports.knx_transport.client.XKNX",
            return_value=failing_xknx,
        ):
            client = KNXTransportClient(knx_metadata, knx_config)
            with pytest.raises(OSError, match="gateway unreachable"):
                await client.connect()

        assert client.connection_state == TransportConnectionState.connection_error()
        assert client._xknx_instance is None


class TestRead:
    async def test_read_success(
        self,
        knx_client: KNXTransportClient,
        mock_xknx: AsyncMock,  # noqa: ARG002
    ) -> None:
        telegram = Mock()
        telegram.payload = GroupValueResponse(DPTBinary(1))
        mock_reader = Mock()
        mock_reader.read = AsyncMock(return_value=telegram)

        with patch(
            "devices_manager.core.transports.knx_transport.client.ValueReader",
            return_value=mock_reader,
        ):
            await knx_client.connect()
            result = await knx_client.read(KNXAddress(topic="1/0/0"))
            assert result is True
            mock_reader.read.assert_awaited_once()

    async def test_read_returns_octet_list(
        self,
        knx_client: KNXTransportClient,
        mock_xknx: AsyncMock,  # noqa: ARG002
    ) -> None:
        telegram = Mock()
        telegram.payload = GroupValueResponse(DPTArray((12, 101)))
        mock_reader = Mock()
        mock_reader.read = AsyncMock(return_value=telegram)

        with patch(
            "devices_manager.core.transports.knx_transport.client.ValueReader",
            return_value=mock_reader,
        ):
            await knx_client.connect()
            result = await knx_client.read(KNXAddress(topic="1/0/1"))
            assert result == [12, 101]

    async def test_read_timeout_raises(
        self,
        knx_client: KNXTransportClient,
        mock_xknx: AsyncMock,  # noqa: ARG002
    ) -> None:
        mock_reader = Mock()
        mock_reader.read = AsyncMock(return_value=None)

        with patch(
            "devices_manager.core.transports.knx_transport.client.ValueReader",
            return_value=mock_reader,
        ):
            await knx_client.connect()
            with pytest.raises(TimeoutError, match="no response"):
                await knx_client.read(KNXAddress(topic="1/0/0"))


class TestWrite:
    async def test_write_puts_telegram(
        self,
        knx_client: KNXTransportClient,
        mock_xknx: AsyncMock,
    ) -> None:
        await knx_client.connect()
        await knx_client.write(KNXAddress(topic="1/0/1"), [0x0C, 0x65])  # type: ignore[arg-type]
        mock_xknx.telegrams.put.assert_awaited_once()
        put_arg = mock_xknx.telegrams.put.await_args.args[0]
        assert put_arg.destination_address == GroupAddress("1/0/1")
        assert isinstance(put_arg.payload, GroupValueWrite)
        assert list(put_arg.payload.value.value) == [0x0C, 0x65]


class TestListeners:
    async def test_dispatches_matching_address(
        self,
        knx_client: KNXTransportClient,
        mock_xknx: AsyncMock,  # noqa: ARG002
    ) -> None:
        received: list[object] = []
        await knx_client.connect()
        await knx_client.register_listener("1/0/0", received.append)

        knx_client._on_telegram_received(
            Telegram(GroupAddress("1/0/0"), payload=GroupValueWrite(DPTBinary(0)))
        )
        assert received == [False]

    async def test_dispatches_group_value_response(
        self,
        knx_client: KNXTransportClient,
        mock_xknx: AsyncMock,  # noqa: ARG002
    ) -> None:
        received: list[object] = []
        await knx_client.connect()
        await knx_client.register_listener("1/0/0", received.append)

        knx_client._on_telegram_received(
            Telegram(GroupAddress("1/0/0"), payload=GroupValueResponse(DPTBinary(1)))
        )
        assert received == [True]

    async def test_ignores_other_address(
        self,
        knx_client: KNXTransportClient,
        mock_xknx: AsyncMock,  # noqa: ARG002
    ) -> None:
        received: list[object] = []
        await knx_client.connect()
        await knx_client.register_listener("1/0/0", received.append)

        knx_client._on_telegram_received(
            Telegram(GroupAddress("2/0/0"), payload=GroupValueWrite(DPTBinary(1)))
        )
        assert received == []

    async def test_ignores_group_value_read(
        self,
        knx_client: KNXTransportClient,
        mock_xknx: AsyncMock,  # noqa: ARG002
    ) -> None:
        received: list[object] = []
        await knx_client.connect()
        await knx_client.register_listener("1/0/0", received.append)

        knx_client._on_telegram_received(
            Telegram(GroupAddress("1/0/0"), payload=GroupValueRead())
        )
        assert received == []

    async def test_unregister_stops_dispatch(
        self,
        knx_client: KNXTransportClient,
        mock_xknx: AsyncMock,  # noqa: ARG002
    ) -> None:
        received: list[object] = []
        await knx_client.connect()
        lid = await knx_client.register_listener("1/0/0", received.append)
        await knx_client.unregister_listener(lid, "1/0/0")

        knx_client._on_telegram_received(
            Telegram(GroupAddress("1/0/0"), payload=GroupValueWrite(DPTBinary(1)))
        )
        assert received == []
