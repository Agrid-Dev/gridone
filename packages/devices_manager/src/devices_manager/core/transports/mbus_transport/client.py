import asyncio

import meterbus
import serial

from devices_manager.core.transports.base import PullTransportClient
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.types import AttributeValueType, TransportProtocols

from .mbus_address import MBusAddress
from .transport_config import MBusRfc2217Config, MBusSerialConfig, MBusSocketConfig

MBUS_READ_TIMEOUT_SECONDS = 5


class MBusTransportClient(PullTransportClient[MBusAddress]):
    protocol = TransportProtocols.MBUS
    address_builder = MBusAddress
    config: MBusRfc2217Config | MBusSocketConfig | MBusSerialConfig
    _serial: serial.SerialBase

    def __init__(
        self,
        metadata: TransportMetadata,
        config: MBusRfc2217Config | MBusSocketConfig | MBusSerialConfig,
    ) -> None:
        super().__init__(metadata, config)

    async def connect(self) -> None:
        async with self._connection_lock:
            self._serial = await asyncio.to_thread(self._open)
            await super().connect()

    def _open(self) -> serial.SerialBase:
        """Open the connection to the M-Bus device based on the configured mode.

        All three paths run synchronously in a worker thread — serial I/O blocks.
        """
        if isinstance(self.config, MBusRfc2217Config):
            return serial.serial_for_url(
                f"rfc2217://{self.config.host}:{self.config.port}",
                baudrate=self.config.baud_rate,
                timeout=MBUS_READ_TIMEOUT_SECONDS,
            )
        if isinstance(self.config, MBusSocketConfig):
            return serial.serial_for_url(
                f"socket://{self.config.host}:{self.config.port}",
                timeout=MBUS_READ_TIMEOUT_SECONDS,
            )
        # MBusSerialConfig — direct USB/serial dongle
        return serial.Serial(
            self.config.device,
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
        records = telegram.records
        if address.record_index >= len(records):
            msg = (
                f"Record index {address.record_index} out of range: meter at "
                f"address {address.primary_address} returned {len(records)} records"
            )
            raise IndexError(msg)
        return float(records[address.record_index].parsed_value)

    async def read(self, address: MBusAddress) -> AttributeValueType:
        return await self._read_mbus(address)

    async def write(
        self,
        address: MBusAddress,
        value: AttributeValueType,
    ) -> None:
        msg = "M-Bus is a read-only transport"
        raise NotImplementedError(msg)
