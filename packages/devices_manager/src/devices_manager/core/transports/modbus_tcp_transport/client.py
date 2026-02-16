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
    _config_builder = ModbusTCPTransportConfig
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
    async def _read_modbus(
        self, modbus_address: ModbusAddress
    ) -> bool | int | list[int]:
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
                count=modbus_address.count,
                device_id=modbus_address.device_id,
            )
            if modbus_address.count == 1:
                return result.registers[0]
            return result.registers
        if modbus_address.type == ModbusAddressType.INPUT_REGISTER:
            result = await self._client.read_input_registers(
                modbus_address.instance,
                count=modbus_address.count,
                device_id=modbus_address.device_id,
            )
            if modbus_address.count == 1:
                return result.registers[0]
            return result.registers
        msg = f"Unknown address type: {modbus_address.type}"
        raise ValueError(msg)

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
            if modbus_address.count == 1:
                await self._client.write_register(
                    modbus_address.instance,
                    payload,
                    device_id=modbus_address.device_id,
                )
            else:
                await self._client.write_registers(
                    modbus_address.instance,
                    payload,
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
