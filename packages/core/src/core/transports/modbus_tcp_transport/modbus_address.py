import re
from enum import StrEnum

from pydantic import BaseModel, PositiveInt

from core.transports.transport_address import RawTransportAddress, TransportAddress


class ModbusAddressType(StrEnum):
    COIL = "C"
    DISCRETE_INPUT = "DI"
    INPUT_REGISTER = "IR"
    HOLDING_REGISTER = "HR"


WRITABLE_MODBUS_ADDRESS_TYPES = {
    ModbusAddressType.COIL,
    ModbusAddressType.HOLDING_REGISTER,
}

address_type_regex = r"^(" + "|".join(list(ModbusAddressType)) + r")[\s:-]*(\d+)$"
instance_regex = r"^\d+$"


class ModbusAddress(BaseModel, TransportAddress):
    type: ModbusAddressType
    instance: PositiveInt
    device_id: PositiveInt

    @property
    def id(self) -> str:
        return f"modbus@device:{self.device_id}/{self.type.value}:{self.instance}"

    @classmethod
    def from_str(
        cls, address_str: str, extra_context: dict | None = None
    ) -> "ModbusAddress":
        trimmed_address = address_str.strip()
        match = re.fullmatch(address_type_regex, trimmed_address)
        if not match:
            msg = f"Invalid Modbus address format: {address_str}"
            raise ValueError(msg)
        address_type = ModbusAddressType(match.group(1))
        instance = int(match.group(2))
        if extra_context is None or extra_context.get("device_id") is None:
            msg = "device_id is required"
            raise ValueError(msg)

        return cls(
            type=address_type,
            instance=instance,
            device_id=extra_context.get("device_id"),
        )

    @classmethod
    def from_dict(
        cls, address_dict: dict, extra_context: dict | None = None
    ) -> "ModbusAddress":
        combined_context = {**address_dict, **(extra_context or {})}
        return cls(**combined_context)

    @classmethod
    def from_raw(
        cls, raw_address: RawTransportAddress, extra_context: dict | None = None
    ) -> "ModbusAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address, extra_context)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address, extra_context)
        msg = "Invalid raw address type"
        raise ValueError(msg)
