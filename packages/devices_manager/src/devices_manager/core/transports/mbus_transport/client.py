import asyncio

import meterbus
import serial

from devices_manager.core.transports.base import PullTransportClient
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.types import AttributeValueType, TransportProtocols

from .mbus_address import MBusAddress
from .transport_config import MBusTransportConfig

MBUS_READ_TIMEOUT_SECONDS = 5


class MBusTransportClient(PullTransportClient[MBusAddress]):
    _config_builder = MBusTransportConfig
    protocol = TransportProtocols.MBUS
    address_builder = MBusAddress
    config: MBusTransportConfig
    _serial: serial.SerialBase

    def __init__(
        self, metadata: TransportMetadata, config: MBusTransportConfig
    ) -> None:
        super().__init__(metadata, config)

    async def connect(self) -> None:
        async with self._connection_lock:
            self._serial = await asyncio.to_thread(self._open)
            await super().connect()

    def _open(self) -> serial.SerialBase:
        """Open the RFC 2217 TCP connection to the M-Bus gateway.

        ``serial_for_url`` connects to the gateway and performs Telnet/RFC 2217
        negotiation synchronously, so it runs in a worker thread. If the gateway
        is unreachable it raises, failing the connection fast.
        """
        return serial.serial_for_url(
            f"rfc2217://{self.config.host}:{self.config.port}",
            baudrate=self.config.baud_rate,
            timeout=MBUS_READ_TIMEOUT_SECONDS,
        )

    async def close(self) -> None:
        if self.connection_state.is_connected:
            async with self._connection_lock:
                self._serial.close()
                await super().close()

    def _fetch(self, primary_address: int) -> meterbus.TelegramLong:
        """Request one meter's data and parse its variable-data reply.

        ``send_request_frame`` issues REQ_UD2 to the meter; ``recv_frame`` reads
        raw bytes until a complete M-Bus frame is buffered; ``load`` parses those
        bytes into a telegram. Runs synchronously in a worker thread.
        """
        meterbus.send_request_frame(self._serial, primary_address)
        data = meterbus.recv_frame(self._serial)
        if not data:
            msg = f"No response from M-Bus meter at address {primary_address}"
            raise ConnectionError(msg)
        return meterbus.load(data)

    @connected
    async def _read_mbus(self, address: MBusAddress) -> float:
        telegram = await asyncio.to_thread(self._fetch, address.primary_address)
        record = telegram.records[address.record_index]
        return float(record.parsed_value)

    async def read(self, address: MBusAddress) -> AttributeValueType:
        return await self._read_mbus(address)

    async def write(
        self,
        address: MBusAddress,
        value: AttributeValueType,
    ) -> None:
        msg = "M-Bus is a read-only transport"
        raise NotImplementedError(msg)
