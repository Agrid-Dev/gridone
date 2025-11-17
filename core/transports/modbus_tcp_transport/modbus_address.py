import re
from dataclasses import dataclass
from enum import StrEnum

from core.transports.transport_address import RawTransportAddress, TransportAddress


class ModbusAddressType(StrEnum):
    COIL = "C"
    DISCRETE_INPUT = "DI"
    INPUT_REGISTER = "IR"
    HOLDING_REGISTER = "HR"


address_type_regex = r"^(" + "|".join(list(ModbusAddressType)) + r")[\s:-]*(\d+)$"
instance_regex = r"^\d+$"

instance_regex = r"^\d+$"


@dataclass
class ModbusAddress(TransportAddress):
    type: ModbusAddressType
    instance: int

    @classmethod
    def from_str(cls, address: str) -> "ModbusAddress":
        trimmed_address = address.strip()
        match = re.fullmatch(address_type_regex, trimmed_address)
        if not match:
            msg = f"Invalid Modbus address format: {address}"
            raise ValueError(msg)
        address_type = ModbusAddressType(match.group(1))
        instance = int(match.group(2))
        return cls(type=address_type, instance=instance)

    @classmethod
    def from_dict(cls, address: dict) -> "ModbusAddress":
        return cls(**address)

    @classmethod
    def from_raw(cls, raw_address: RawTransportAddress) -> "ModbusAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address)
        msg = "Invalid raw address type"
        raise ValueError(msg)
