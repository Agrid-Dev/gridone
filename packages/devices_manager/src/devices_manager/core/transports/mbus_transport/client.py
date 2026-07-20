import asyncio
import logging
import time

import meterbus
import serial

from devices_manager.core.transports.base import PullTransportClient
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.types import AttributeValueType, TransportProtocols

from .mbus_address import MBusAddress
from .transport_config import MBusTransportConfig

MBUS_READ_TIMEOUT_SECONDS = 5
MBUS_TELEGRAM_CACHE_TTL = 1.0

logger = logging.getLogger(__name__)


class MBusTransportClient(PullTransportClient[MBusAddress]):
    _config_builder = MBusTransportConfig
    protocol = TransportProtocols.MBUS
    address_builder = MBusAddress
    config: MBusTransportConfig
    _serial: serial.SerialBase
    _telegram_cache: dict[int, tuple[float, meterbus.TelegramLong]]
    _serialize_reads = True

    def __init__(
        self, metadata: TransportMetadata, config: MBusTransportConfig
    ) -> None:
        super().__init__(metadata, config)
        self._telegram_cache = {}

    async def connect(self) -> None:
        async with self._connection_lock:
            self._serial = await asyncio.wait_for(
                asyncio.to_thread(self._open), timeout=MBUS_READ_TIMEOUT_SECONDS
            )
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
            # Lock order: see TransportClient._read_lock in base.py.
            async with self._read_lock, self._connection_lock:
                self._serial.close()
                self._telegram_cache.clear()
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

    def _fetch_cached(self, primary_address: int) -> meterbus.TelegramLong:
        """Return a cached telegram, fetching from the meter only on a miss or expiry.

        Cache entries expire after MBUS_TELEGRAM_CACHE_TTL seconds so a fresh
        REQ_UD2 is always sent on the next poll cycle. Runs in a worker thread.
        """
        cached = self._telegram_cache.get(primary_address)
        if cached is not None and (
            time.monotonic() - cached[0] < MBUS_TELEGRAM_CACHE_TTL
        ):
            logger.debug("M-Bus cache hit for primary address %d", primary_address)
            return cached[1]
        logger.debug(
            "M-Bus cache miss — sending REQ_UD2 to primary address %d", primary_address
        )
        telegram = self._fetch(primary_address)
        self._telegram_cache[primary_address] = (time.monotonic(), telegram)
        return telegram

    @connected
    async def _read_mbus(self, address: MBusAddress) -> float:
        telegram = await asyncio.to_thread(self._fetch_cached, address.primary_address)
        records = telegram.records
        if address.record_index >= len(records):
            msg = (
                f"Record index {address.record_index} out of range: meter at "
                f"address {address.primary_address} returned {len(records)} records"
            )
            raise IndexError(msg)
        return float(records[address.record_index].parsed_value)

    async def _read(self, address: MBusAddress) -> AttributeValueType:
        return await self._read_mbus(address)

    async def write(
        self,
        address: MBusAddress,
        value: AttributeValueType,
    ) -> None:
        msg = "M-Bus is a read-only transport"
        raise NotImplementedError(msg)
