from typing import Annotated

from pydantic import BaseModel, Field, NonNegativeInt

from devices_manager.core.transports.transport_address import (
    RawTransportAddress,
    TransportAddress,
)

ADDRESS_PARTS = 2
# M-Bus primary addresses span 0-250; 251-255 are reserved by the spec.
MBUS_MAX_PRIMARY_ADDRESS = 250


class MBusAddress(BaseModel, TransportAddress):
    primary_address: Annotated[int, Field(ge=0, le=MBUS_MAX_PRIMARY_ADDRESS)]
    record_index: NonNegativeInt

    @property
    def id(self) -> str:
        return f"mbus@{self.primary_address}/{self.record_index}"

    @classmethod
    def from_str(
        cls,
        address_str: str,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "MBusAddress":
        """Parse an M-Bus address of the form ``<primary>/<record>``.

        Example: ``"1/0"`` → primary address 1, record index 0. Parses the two
        integer parts; range/sign constraints are enforced by the model (so the
        string and dict paths reject the same values), raising ``ValueError``.
        """
        parts = address_str.strip().split("/")
        if len(parts) != ADDRESS_PARTS:
            msg = f"Invalid M-Bus address format: {address_str}"
            raise ValueError(msg)
        try:
            primary, record = int(parts[0]), int(parts[1])
        except ValueError as e:
            msg = f"Invalid M-Bus address format: {address_str}"
            raise ValueError(msg) from e
        return cls(primary_address=primary, record_index=record)

    @classmethod
    def from_dict(
        cls, address_dict: dict, extra_context: dict | None = None
    ) -> "MBusAddress":
        combined_context = {**address_dict, **(extra_context or {})}
        return cls(**combined_context)

    @classmethod
    def from_raw(
        cls, raw_address: RawTransportAddress, extra_context: dict | None = None
    ) -> "MBusAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address, extra_context)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address, extra_context)
        msg = "Invalid raw address type"
        raise ValueError(msg)
