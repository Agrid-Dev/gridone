from pymodbus.client import AsyncModbusTcpClient

from core.transports import TransportClient
from core.types import AttributeValueType, TransportProtocols
from core.value_parsers import ValueParser

from .modbus_address import ModbusAddress, ModbusAddressType
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

    async def _read_modbus(self, address: str | dict, device_id: int) -> bool | int:
        if not self._client.connected:
            await self.connect()
        modbus_address = ModbusAddress.from_raw(address)
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

    async def read(
        self,
        address: str,
        value_parser: ValueParser | None = None,
    ) -> AttributeValueType:
        raw_value = await self._read_modbus(address, context.get("device_id", 1))
        if value_parser:
            return value_parser(raw_value)  # pyright: ignore[reportArgumentType]
        return raw_value

    async def write(
        self,
        address: str,
        value: AttributeValueType,
    ) -> None:
        msg = "Not ready !"
        raise NotImplementedError(msg)
