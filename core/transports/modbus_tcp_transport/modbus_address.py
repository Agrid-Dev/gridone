import re
from dataclasses import dataclass
from enum import StrEnum


class ModbusAddressType(StrEnum):
    COIL = "C"
    DISCRETE_INPUT = "DI"
    INPUT_REGISTER = "IR"
    HOLDING_REGISTER = "HR"


address_type_regex = r"^(" + "|".join(list(ModbusAddressType)) + r")[\s:-]*(\d+)$"
instance_regex = r"^\d+$"

instance_regex = r"^\d+$"


@dataclass
class ModbusAddress:
    type: ModbusAddressType
    instance: int

    @staticmethod
    def from_str(raw_address: str) -> "ModbusAddress":
        trimmed_address = raw_address.strip()
        match = re.fullmatch(address_type_regex, trimmed_address)
        if not match:
            msg = f"Invalid Modbus address format: {raw_address}"
            raise ValueError(msg)
        address_type = ModbusAddressType(match.group(1))
        instance = int(match.group(2))
        return ModbusAddress(type=address_type, instance=instance)
