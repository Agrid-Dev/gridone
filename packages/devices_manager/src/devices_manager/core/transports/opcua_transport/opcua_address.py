import re
from typing import Literal

from pydantic import BaseModel, ValidationInfo, field_validator

from devices_manager.core.transports.transport_address import (
    RawTransportAddress,
    TransportAddress,
)

OpcuaIdentifierType = Literal["i", "s", "g", "b"]

DEFAULT_NAMESPACE_INDEX = 0

# Matches "ns=<idx>;<type>=<value>" (ns optional, defaults to 0), tolerating
# whitespace around "=" and ";", e.g. "ns=2;s=Chiller.SupplyTemp", "i=1042",
# or "ns = 2 ; s = Chiller.SupplyTemp".
opcua_node_id_regex = r"^(?:ns\s*=\s*(\d+)\s*;\s*)?(i|s|g|b)\s*=\s*(.+)$"


class OpcuaAddress(BaseModel, TransportAddress):
    namespace_index: int = DEFAULT_NAMESPACE_INDEX
    identifier_type: OpcuaIdentifierType
    identifier: int | str

    @field_validator("identifier", mode="after")
    @classmethod
    def _normalize_numeric_identifier(
        cls, v: int | str, info: ValidationInfo
    ) -> int | str:
        if info.data.get("identifier_type") != "i":
            return v
        try:
            return int(v)
        except (TypeError, ValueError) as e:
            msg = f"Invalid OPC-UA numeric identifier: {v}"
            raise ValueError(msg) from e

    @property
    def id(self) -> str:
        return f"ns={self.namespace_index};{self.identifier_type}={self.identifier}"

    @classmethod
    def from_dict(
        cls,
        address_dict: dict,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "OpcuaAddress":
        namespace_index = address_dict.get("ns", DEFAULT_NAMESPACE_INDEX)
        present_types = [t for t in ("i", "s", "g", "b") if t in address_dict]
        if len(present_types) != 1:
            msg = (
                "Invalid OPC-UA NodeId dict, expected exactly one of "
                f"i/s/g/b: {address_dict}"
            )
            raise ValueError(msg)
        identifier_type = present_types[0]
        return cls(
            namespace_index=namespace_index,
            identifier_type=identifier_type,
            identifier=address_dict[identifier_type],
        )

    @classmethod
    def from_str(
        cls,
        address_str: str,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "OpcuaAddress":
        match = re.match(opcua_node_id_regex, address_str.strip())
        if match is None:
            msg = f"Invalid OPC-UA NodeId format: {address_str}"
            raise ValueError(msg)
        namespace_group, identifier_type, identifier_raw = match.groups()
        namespace_index = (
            int(namespace_group)
            if namespace_group is not None
            else DEFAULT_NAMESPACE_INDEX
        )
        return cls(
            namespace_index=namespace_index,
            identifier_type=identifier_type,  # type: ignore[arg-type]
            identifier=identifier_raw.strip(),
        )

    @classmethod
    def from_raw(
        cls, raw_address: RawTransportAddress, extra_context: dict | None = None
    ) -> "OpcuaAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address, extra_context)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address, extra_context)
        msg = "Invalid raw address type"
        raise ValueError(msg)
