from pydantic import BaseModel, NonNegativeInt

from devices_manager.core.transports.transport_address import (
    RawTransportAddress,
    TransportAddress,
)

ADDRESS_PARTS = 2


class MBusAddress(BaseModel, TransportAddress):
    primary_address: NonNegativeInt
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

        Example: ``"1/0"`` → primary address 1, record index 0. Both parts must
        be non-negative integers; anything else raises ``ValueError``.
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
        if primary < 0 or record < 0:
            msg = f"M-Bus address parts must be non-negative: {address_str}"
            raise ValueError(msg)
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
