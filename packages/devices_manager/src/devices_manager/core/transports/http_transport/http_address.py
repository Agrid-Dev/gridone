from functools import cached_property
from typing import Literal, cast

from pydantic import BaseModel

from devices_manager.core.transports.hash_model import hash_model
from devices_manager.core.transports.transport_address import (
    RawTransportAddress,
    TransportAddress,
)

type HttpMethod = Literal["GET", "POST", "PUT", "DELETE", "PATCH"]
HTTP_METHODS: set[HttpMethod] = {
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
}


class HttpAddress(BaseModel, TransportAddress):
    method: HttpMethod
    path: str
    body: str | dict | None = None

    @cached_property
    def id(self) -> str:
        return hash_model(self)

    @classmethod
    def from_str(
        cls,
        address_str: str,
        extra_context: dict | None = None,  # noqa: ARG003
    ) -> "HttpAddress":
        parts = address_str.strip().split()
        method = parts[0]
        if method not in HTTP_METHODS:
            msg = f"Invalid HTTP method {method}, allowed: {' ,'.join(HTTP_METHODS)}"
            raise ValueError(
                msg,
            )
        endpoint = parts[-1]
        return cls(method=cast("HttpMethod", method), path=endpoint)

    @classmethod
    def from_dict(
        cls, address_dict: dict, extra_context: dict | None = None
    ) -> "HttpAddress":
        combined_context = {**address_dict, **(extra_context or {})}
        return cls(**combined_context)

    @classmethod
    def from_raw(
        cls, raw_address: RawTransportAddress, extra_context: dict | None = None
    ) -> "HttpAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address, extra_context)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address, extra_context)
        msg = "Invalid raw address type"
        raise ValueError(msg)
