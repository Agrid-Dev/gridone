import re
from enum import StrEnum

from pydantic import BaseModel, NonNegativeInt

from devices_manager.core.transports.transport_address import (
    RawTransportAddress,
    TransportAddress,
)


class ModbusAddressType(StrEnum):
    COIL = "C"
    DISCRETE_INPUT = "DI"
    INPUT_REGISTER = "IR"
    HOLDING_REGISTER = "HR"


WRITABLE_MODBUS_ADDRESS_TYPES = {
    ModbusAddressType.COIL,
    ModbusAddressType.HOLDING_REGISTER,
}

address_type_regex = r"^(" + "|".join(list(ModbusAddressType)) + r")"


class ModbusAddress(BaseModel, TransportAddress):
    type: ModbusAddressType
    instance: NonNegativeInt
    device_id: NonNegativeInt
    count: int = 1  # default to 1

    @property
    def id(self) -> str:
        base = f"modbus@device:{self.device_id}/{self.type.value}:{self.instance}"
        if self.count is not None:
            return f"{base}:{self.count}"
        return base

    @classmethod
    def from_str(
        cls, address_str: str, extra_context: dict | None = None
    ) -> "ModbusAddress":
        trimmed_address = address_str.strip()
        type_match = re.match(address_type_regex, trimmed_address)
        if not type_match:
            msg = f"Invalid Modbus address format: {address_str}"
            raise ValueError(msg)
        address_type = ModbusAddressType(type_match.group(1))
        remainder = trimmed_address[len(address_type.value) :].strip()

        if address_type in {
            ModbusAddressType.HOLDING_REGISTER,
            ModbusAddressType.INPUT_REGISTER,
        }:
            # HR/IR can have optional count: "4", "4:2", "4x2", "4-2", plus
            match = re.fullmatch(
                r"[\s:-]*(\d+)(?:\s*[:x-]\s*(\d+))?\s*$",
                remainder,
            )
        else:
            # Other types (C, DI) only support an instance, with optional
            match = re.fullmatch(r"[\s:-]*(\d+)\s*$", remainder)
        if not match:
            msg = f"Invalid Modbus address format: {address_str}"
            raise ValueError(msg)

        instance = int(match.group(1))
        if address_type in {
            ModbusAddressType.HOLDING_REGISTER,
            ModbusAddressType.INPUT_REGISTER,
        }:
            count_str = match.group(2)
            count = int(count_str) if count_str is not None else 1
        else:
            count = 1

        if count < 1:
            msg = f"Invalid Modbus address count ({count}) for {address_str}"
            raise ValueError(msg)

        if (
            address_type
            not in {
                ModbusAddressType.HOLDING_REGISTER,
                ModbusAddressType.INPUT_REGISTER,
            }
            and count != 1
        ):
            msg = (
                f"Count is only supported for HR/IR addresses, "
                f"got {address_type} with count={count}"
            )
            raise ValueError(msg)

        if extra_context is None or extra_context.get("device_id") is None:
            msg = "device_id is required"
            raise ValueError(msg)

        return cls(
            type=address_type,
            instance=instance,
            device_id=extra_context.get("device_id"),
            count=count,
        )

    @classmethod
    def from_dict(
        cls, address_dict: dict, extra_context: dict | None = None
    ) -> "ModbusAddress":
        combined_context = {**address_dict, **(extra_context or {})}

        # Default count to 1 when not provided.
        if "count" not in combined_context:
            combined_context["count"] = 1

        address_type = combined_context.get("type")
        count = combined_context.get("count", 1)

        if isinstance(address_type, ModbusAddressType):
            parsed_type = address_type
        elif isinstance(address_type, str):
            parsed_type = ModbusAddressType(address_type)
        else:
            msg = f"Invalid Modbus address type: {address_type}"
            raise TypeError(msg)

        if count < 1:
            msg = f"Invalid Modbus address count ({count}) for dict address"
            raise ValueError(msg)

        if (
            parsed_type
            not in {
                ModbusAddressType.HOLDING_REGISTER,
                ModbusAddressType.INPUT_REGISTER,
            }
            and count != 1
        ):
            msg = (
                "Count is only supported for HR/IR addresses in dict form, "
                f"got {parsed_type} with count={count}"
            )
            raise ValueError(msg)

        combined_context["type"] = parsed_type

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
