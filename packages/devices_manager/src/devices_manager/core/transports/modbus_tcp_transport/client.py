import logging
from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import Any

from pymodbus.client import AsyncModbusTcpClient

from devices_manager.core.transports import PullTransportClient
from devices_manager.core.transports.base import dedupe_addresses
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.read_result import ReadError, ReadOk, ReadResult
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.core.utils.cast.bool import cast_as_bool
from devices_manager.types import AttributeValueType, TransportProtocols

from .block_plan import ModbusBlock, plan_blocks
from .modbus_address import (
    WRITABLE_MODBUS_ADDRESS_TYPES,
    ModbusAddress,
    ModbusAddressType,
)
from .transport_config import ModbusTCPTransportConfig

logger = logging.getLogger(__name__)


class ModbusTCPTransportClient(PullTransportClient[ModbusAddress]):
    _client: AsyncModbusTcpClient
    _config_builder = ModbusTCPTransportConfig
    protocol = TransportProtocols.MODBUS_TCP
    address_builder = ModbusAddress
    config: ModbusTCPTransportConfig
    _serialize_reads = True

    def __init__(
        self, metadata: TransportMetadata, config: ModbusTCPTransportConfig
    ) -> None:
        super().__init__(metadata, config)

    async def connect(self) -> None:
        async with self._connection_lock:
            client = getattr(self, "_client", None)
            # Concurrent reads on one transport all hit @connected / the reconnect
            # check at once; bail if another caller already (re)connected so we
            # don't spawn — and leak — a client per attribute.
            if client is not None and client.connected:
                return
            # Never orphan the previous socket: WAGO PLCs cap concurrent Modbus
            # TCP connections, and leaked clients exhaust that pool ("Not
            # connected" fleet-wide).
            if client is not None:
                client.close()
            self._client = AsyncModbusTcpClient(
                host=self.config.host,
                port=self.config.port,
                timeout=self.config.read_timeout,
            )
            await self._client.connect()
            await super().connect()

    async def close(self) -> None:
        if self.connection_state.is_connected:
            async with self._connection_lock:
                self._client.close()
                await super().close()

    def _reader(self, address_type: ModbusAddressType) -> Callable[..., Awaitable[Any]]:
        """Map an address type to the pymodbus call that reads it."""
        if address_type == ModbusAddressType.COIL:
            return self._client.read_coils
        if address_type == ModbusAddressType.DISCRETE_INPUT:
            return self._client.read_discrete_inputs
        if address_type == ModbusAddressType.HOLDING_REGISTER:
            return self._client.read_holding_registers
        if address_type == ModbusAddressType.INPUT_REGISTER:
            return self._client.read_input_registers
        msg = f"Unknown address type: {address_type}"
        raise ValueError(msg)

    @connected
    async def _fetch_block(self, block: ModbusBlock) -> list[int] | list[bool]:
        """Issue one request for a whole block and return its raw payload."""
        if not self._client.connected:
            await self.connect()
        result = await self._reader(block.type)(
            block.start,
            count=block.count,
            device_id=block.device_id,
        )
        return result.bits if block.is_bit else result.registers

    async def _read_block(
        self, block: ModbusBlock, correlation_id: str | None
    ) -> list[ReadResult]:
        """Fetch one block and split it back into a result per member address.

        The lock is held for the transaction only, then released before the
        results are handed on, so one long sweep cannot starve another read.
        A block that fails marks its own members failed and nothing else.
        """
        async with self._read_lock:
            epoch = self._cache_epoch
            try:
                payload = await self._fetch_block(block)
                values = [
                    (address, block.extract(address, payload))
                    for address in block.addresses
                ]
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "[Transport %s] block read %s%d:%d failed — %s: %s",
                    self.id,
                    block.type.value,
                    block.start,
                    block.count,
                    type(e).__name__,
                    e,
                )
                return [ReadError(address.id, e) for address in block.addresses]
        for address, value in values:
            self._cache_put(address, correlation_id, value, epoch)  # ty: ignore[invalid-argument-type]
        return [ReadOk(address.id, value) for address, value in values]  # ty: ignore[invalid-argument-type]

    async def read_many(
        self,
        addresses: list[ModbusAddress],
        correlation_id: str | None = None,
    ) -> AsyncGenerator[ReadResult]:
        """Read addresses as coalesced block reads — one request per contiguous
        run of registers/bits rather than one per address.
        """
        pending: list[ModbusAddress] = []
        for address in dedupe_addresses(addresses).values():
            cached = self._cache_get(address, correlation_id)
            if cached is None:
                pending.append(address)
            else:
                yield ReadOk(address.id, cached)

        blocks = plan_blocks(
            pending,
            max_block=self.config.max_block,
            max_gap=self.config.max_gap,
        )
        if blocks:
            logger.debug(
                "[Transport %s] %d address(es) coalesced into %d block read(s): %s",
                self.id,
                len(pending),
                len(blocks),
                [f"{b.type.value}{b.start}:{b.count}" for b in blocks],
            )
        for block in blocks:
            for result in await self._read_block(block, correlation_id):
                yield result

    def _validate_holding_register_value(
        self,
        modbus_address: ModbusAddress,
        value: int | bool | list[int],  # noqa: FBT001
    ) -> int | list[int]:
        """Validate value for HR write; return int (single reg) or list[int]."""
        if isinstance(value, list):
            if modbus_address.count != len(value):
                msg = (
                    "Length of provided values does not match Modbus "
                    f"address count (got {len(value)}, expected "
                    f"{modbus_address.count})"
                )
                raise ValueError(msg)
            return value
        try:
            return int(value)
        except (ValueError, TypeError) as e:
            msg = (
                f"Cannot write a non integer value ({value}) "
                "to a Modbus HOLDING_REGISTER"
            )
            raise ValueError(msg) from e

    @connected
    async def _write_modbus(
        self,
        modbus_address: ModbusAddress,
        value: int | bool | list[int],  # noqa: FBT001
    ) -> None:
        if modbus_address.type not in WRITABLE_MODBUS_ADDRESS_TYPES:
            msg = f"Address type {modbus_address.type} is not writable"
            raise ValueError(msg)
        if modbus_address.type == ModbusAddressType.COIL:
            try:
                bool_value = cast_as_bool(value)
            except ValueError as e:
                msg = f"Cannot write a non boolean value ({value}) to a Modbus COIL"
                raise ValueError(msg) from e
            await self._client.write_coil(
                modbus_address.instance,
                bool_value,
                device_id=modbus_address.device_id,
            )
            return
        if modbus_address.type == ModbusAddressType.HOLDING_REGISTER:
            payload = self._validate_holding_register_value(modbus_address, value)
            if isinstance(payload, list):
                await self._client.write_registers(
                    modbus_address.instance,
                    payload,
                    device_id=modbus_address.device_id,
                )
            else:
                await self._client.write_register(
                    modbus_address.instance,
                    payload,
                    device_id=modbus_address.device_id,
                )
            return
        msg = f"Unknown address type: {modbus_address.type}"
        raise ValueError(msg)

    async def _read(
        self,
        address: ModbusAddress,
    ) -> AttributeValueType:
        """A single read is just a one-block read, so both paths share the same
        request dispatch and the same raw-shape rule."""
        block = plan_blocks(
            [address],
            max_block=self.config.max_block,
            max_gap=self.config.max_gap,
        )[0]
        payload = await self._fetch_block(block)
        return block.extract(address, payload)  # ty: ignore[invalid-return-type]

    async def write(
        self,
        address: ModbusAddress,
        value: AttributeValueType,
    ) -> None:
        await self._write_modbus(address, value)  # ty: ignore[invalid-argument-type]
