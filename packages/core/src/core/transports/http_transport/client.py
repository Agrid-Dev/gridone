from __future__ import annotations

from typing import Any, cast

import httpx

from core.transports import TransportClient
from core.types import AttributeValueType, TransportProtocols

from .http_address import HttpAddress

REQUEST_TIMEOUT = 10.0  # s


class HTTPTransportClient(TransportClient[HttpAddress]):
    protocol = TransportProtocols.HTTP
    address_builder = HttpAddress

    def __init__(
        self,
        *,
        timeout: float = REQUEST_TIMEOUT,
    ) -> None:
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None
        super().__init__()

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
        address: HttpAddress,
    ) -> AttributeValueType:
        if self._client is None:
            msg = "HTTP transport is not connected"
            raise RuntimeError(msg)
        data: dict[str, Any] | None = None
        content: str | bytes | None = None
        if address.body is None:
            data = None
        elif isinstance(address.body, dict):
            data = cast("dict[str, Any]", address.body)
        else:
            content = address.body
        response = await self._client.request(
            address.method,
            address.path,
            data=data,
            content=content,
        )
        return response.json()

    async def write(
        self,
        address: HttpAddress,
        value: AttributeValueType,
    ) -> None:
        if self._client is None:
            msg = "HTTP transport is not connected"
            raise RuntimeError(msg)
        # Body is already rendered when coming from the driver; if the caller
        # wants to inject the value they can template it in the write_address.
        if address.body is None:
            data = {"value": value}
            content = None
        elif isinstance(address.body, dict):
            data = address.body
            content = None
        else:
            data = None
            content = address.body
        response = await self._client.request(
            address.method,
            address.path,
            data=data,
            content=content,
        )
        response.raise_for_status()
