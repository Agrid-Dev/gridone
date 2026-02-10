from pymodbus.client import AsyncModbusTcpClient

from devices_manager.core.transports import TransportClient
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.core.utils.cast.bool import cast_as_bool
from devices_manager.types import AttributeValueType, TransportProtocols

from .modbus_address import (
    WRITABLE_MODBUS_ADDRESS_TYPES,
    ModbusAddress,
    ModbusAddressType,
)
from .transport_config import ModbusTCPTransportConfig


class ModbusTCPTransportClient(TransportClient[ModbusAddress]):
    _client: AsyncModbusTcpClient
    protocol = TransportProtocols.MODBUS_TCP
    address_builder = ModbusAddress
    config: ModbusTCPTransportConfig

    def __init__(
        self, metadata: TransportMetadata, config: ModbusTCPTransportConfig
    ) -> None:
        super().__init__(metadata, config)

    async def connect(self) -> None:
        self._client = AsyncModbusTcpClient(
            host=self.config.host, port=self.config.port
        )
        async with self._connection_lock:
            await self._client.connect()
            await super().connect()

    async def close(self) -> None:
        if self.connection_state.is_connected:
            async with self._connection_lock:
                self._client.close()
                await super().close()

    @connected
    async def _read_modbus(self, modbus_address: ModbusAddress) -> bool | int:
        if not self._client.connected:
            await self.connect()

        if modbus_address.type == ModbusAddressType.COIL:
            result = await self._client.read_coils(
                modbus_address.instance,
                count=1,
                device_id=modbus_address.device_id,
            )
            return result.bits[0]
        if modbus_address.type == ModbusAddressType.DISCRETE_INPUT:
            result = await self._client.read_discrete_inputs(
                modbus_address.instance,
                count=1,
                device_id=modbus_address.device_id,
            )
            return result.bits[0]
        if modbus_address.type == ModbusAddressType.HOLDING_REGISTER:
            result = await self._client.read_holding_registers(
                modbus_address.instance,
                count=1,
                device_id=modbus_address.device_id,
            )
            return result.registers[0]
        if modbus_address.type == ModbusAddressType.INPUT_REGISTER:
            result = await self._client.read_input_registers(
                modbus_address.instance,
                count=1,
                device_id=modbus_address.device_id,
            )
            result = await self._client.read_input_registers(
                modbus_address.instance,
                count=1,
                device_id=modbus_address.device_id,
            )
            return result.registers[0]
        msg = f"Unknown address type: {modbus_address.type}"
        raise ValueError(msg)

    @connected
    async def _write_modbus(
        self,
        modbus_address: ModbusAddress,
        value: int | bool,  # noqa: FBT001
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
                device_id=modbus_address.device_id,
            )
            return
        msg = f"Unknown address type: {modbus_address.type}"
        raise ValueError(msg)

    async def read(
        self,
        address: ModbusAddress,
    ) -> AttributeValueType:
        return await self._read_modbus(address)

    async def write(
        self,
        address: ModbusAddress,
        value: AttributeValueType,
    ) -> None:
        await self._write_modbus(address, value)  # ty: ignore[invalid-argument-type]
