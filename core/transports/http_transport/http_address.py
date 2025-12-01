from typing import Literal, cast

from pydantic import BaseModel

from core.transports.transport_address import RawTransportAddress, TransportAddress

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

    @classmethod
    def from_str(cls, address_str: str) -> "HttpAddress":
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
    def from_dict(cls, address_dict: dict) -> "HttpAddress":
        return cls(**address_dict)

    @classmethod
    def from_raw(cls, raw_address: RawTransportAddress) -> "HttpAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address)
        msg = "Invalid raw address type"
        raise ValueError(msg)
