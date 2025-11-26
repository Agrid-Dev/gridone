from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast

import httpx

from core.transports import TransportClient
from core.types import AttributeValueType, TransportProtocols

from .http_address import HttpAddress

if TYPE_CHECKING:
    from core.value_parsers import ValueParser

REQUEST_TIMEOUT = 10.0  # s


class HTTPTransportClient(TransportClient):
    protocol = TransportProtocols.HTTP

    def __init__(
        self,
        *,
        timeout: float = REQUEST_TIMEOUT,
    ) -> None:
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def _build_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=self._timeout)

    async def connect(self) -> None:
        if self._client is None or self._client.is_closed:
            self._client = self._build_client()

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def read(
        self,
        address: str | dict,
        value_parser: ValueParser | None = None,
        *,
        context: dict,  # noqa: ARG002
    ) -> AttributeValueType:
        if self._client is None:
            msg = "HTTP transport is not connected"
            raise RuntimeError(msg)
        http_address = HttpAddress.from_raw(address)
        data: dict[str, Any] | None = None
        content: str | bytes | None = None
        if http_address.body is None:
            data = None
        elif isinstance(http_address.body, dict):
            data = cast("dict[str, Any]", http_address.body)
        else:
            content = http_address.body
        response = await self._client.request(
            http_address.method,
            http_address.path,
            data=data,
            content=content,
        )
        result = response.json()
        if value_parser:
            return value_parser.parse(result)
        return result

    async def write(
        self,
        address: str | dict,
        value: AttributeValueType,
        *,
        value_parser: ValueParser | None = None,  # noqa: ARG002
        context: dict,  # noqa: ARG002
    ) -> None:
        if self._client is None:
            msg = "HTTP transport is not connected"
            raise RuntimeError(msg)
        http_address = HttpAddress.from_raw(address)
        # Body is already rendered when coming from the driver; if the caller
        # wants to inject the value they can template it in the write_address.
        data: dict[str, Any] | None
        content: str | bytes | None
        if http_address.body is None:
            data = {"value": value}
            content = None
        elif isinstance(http_address.body, dict):
            data = cast("dict[str, Any]", http_address.body)
            content = None
        else:
            data = None
            content = http_address.body
        response = await self._client.request(
            http_address.method,
            http_address.path,
            data=data,
            content=content,
        )
        response.raise_for_status()
