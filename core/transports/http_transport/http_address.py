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
    def from_str(cls, address: str) -> "HttpAddress":
        parts = address.strip().split()
        method = parts[0]
        if method not in HTTP_METHODS:
            msg = f"Invalid HTTP method {method}, allowed: {' ,'.join(HTTP_METHODS)}"
            raise ValueError(
                msg,
            )
        endpoint = parts[-1]
        return cls(method=cast("HttpMethod", method), path=endpoint)

    @classmethod
    def from_dict(cls, address: dict) -> "HttpAddress":
        return cls(**address)

    @classmethod
    def from_raw(cls, raw_address: RawTransportAddress) -> "HttpAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address)
        msg = "Invalid raw address type"
        raise ValueError(msg)


def render_endpoint(endpoint: str, config: dict) -> str:
    """Renders templated endpoint eg {base_url}/?latitude={lattitude}&longitude={longitude}
    from dictionary data"""
    for key, value in config.items():
        endpoint = endpoint.replace(f"{{{key}}}", str(value))
    return endpoint
