from pymodbus.client import AsyncModbusTcpClient

from core.transports import TransportClient
from core.types import AttributeValueType, TransportProtocols
from core.value_parsers import ReversibleValueParser, ValueParser

from .modbus_address import (
    WRITABLE_MODBUS_ADDRESS_TYPES,
    ModbusAddress,
    ModbusAddressType,
)
from .transport_config import ModbusTCPTransportConfig


class ModbusTCPTransportClient(TransportClient):
    _client: AsyncModbusTcpClient
    protocol = TransportProtocols.MODBUS_TCP
    config: ModbusTCPTransportConfig

    def __init__(self, config: ModbusTCPTransportConfig) -> None:
        self._client = AsyncModbusTcpClient(host=config.host, port=config.port)

    async def connect(self) -> None:
        await self._client.connect()

    async def close(self) -> None:
        self._client.close()

    async def _read_modbus(
        self, modbus_address: ModbusAddress, device_id: int
    ) -> bool | int:
        if not self._client.connected:
            await self.connect()

        if modbus_address.type == ModbusAddressType.COIL:
            result = await self._client.read_coils(
                modbus_address.instance,
                count=1,
                device_id=device_id,
            )
            return result.bits[0]
        if modbus_address.type == ModbusAddressType.DISCRETE_INPUT:
            result = await self._client.read_discrete_inputs(
                modbus_address.instance,
                count=1,
                device_id=device_id,
            )
            return result.bits[0]
        if modbus_address.type == ModbusAddressType.HOLDING_REGISTER:
            result = await self._client.read_holding_registers(
                modbus_address.instance,
                count=1,
                device_id=device_id,
            )
            return result.registers[0]
        if modbus_address.type == ModbusAddressType.INPUT_REGISTER:
            result = await self._client.read_input_registers(
                modbus_address.instance,
                count=1,
                device_id=device_id,
            )
            result = await self._client.read_input_registers(
                modbus_address.instance,
                count=1,
                device_id=device_id,
            )
            return result.registers[0]
        msg = f"Unknown address type: {modbus_address.type}"
        raise ValueError(msg)

    async def _write_modbus(
        self,
        modbus_address: ModbusAddress,
        device_id: int,
        value: int | bool,  # noqa: FBT001
    ) -> None:
        if modbus_address.type not in WRITABLE_MODBUS_ADDRESS_TYPES:
            msg = f"Address type {modbus_address.type} is not writable"
            raise ValueError(msg)
        if modbus_address.type == ModbusAddressType.COIL:
            try:
                bool_value = bool(value)
            except ValueError as e:
                msg = f"Cannot write a non boolean value ({value}) to a Modbus COIL"
                raise ValueError(msg) from e
            await self._client.write_coil(
                modbus_address.instance,
                bool_value,
                device_id=device_id,
            )
            return
        if modbus_address.type == ModbusAddressType.HOLDING_REGISTER:
            try:
                int_value = int(value)
            except ValueError as e:
                msg = (
                    f"Cannot write a non integer value ({value}) "
                    "to a Modbus HOLDING_REGISTER"
                )
                raise ValueError(msg) from e
            await self._client.write_register(
                modbus_address.instance,
                int_value,
                device_id=device_id,
            )
            return
        msg = f"Unknown address type: {modbus_address.type}"
        raise ValueError(msg)

    async def read(
        self,
        address: str | dict,
        value_parser: ValueParser | None = None,
        *,
        context: dict,
    ) -> AttributeValueType:
        modbus_address = ModbusAddress.from_raw(address)
        raw_value = await self._read_modbus(modbus_address, context.get("device_id", 1))
        if value_parser:
            return value_parser.parse(raw_value)
        return raw_value

    async def write(
        self,
        address: str | dict,
        value: AttributeValueType,
        *,
        value_parser: ValueParser | None = None,
        context: dict,
    ) -> None:
        modbus_address = ModbusAddress.from_raw(address)
        device_id = context.get("device_id", 1)
        if value_parser and isinstance(value_parser, ReversibleValueParser):
            value_to_write = value_parser.revert(value)
        else:
            value_to_write = value
        await self._write_modbus(modbus_address, device_id, value_to_write)  # ty: ignore[invalid-argument-type]
