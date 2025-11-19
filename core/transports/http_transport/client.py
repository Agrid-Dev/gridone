import httpx

from core.transports import TransportClient
from core.types import AttributeValueType, TransportProtocols
from core.value_parsers import ValueParser

from .http_address import HttpAddress

REQUEST_TIMEOUT = 10.0  # s


class HTTPTransportClient(TransportClient):
    protocol = TransportProtocols.HTTP
    _instance = None
    _client: httpx.AsyncClient  # always typed

    def __new__(cls, *args, **kwargs) -> "HTTPTransportClient":  # noqa: ANN002, ANN003, ARG004
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, timeout: float = REQUEST_TIMEOUT) -> None:
        # Only create the client once
        if not hasattr(self, "_client"):
            self._client = httpx.AsyncClient(timeout=timeout)

    async def connect(self) -> None:
        if self._client and self._client.is_closed:  # reopen client if closed
            self._client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)

    async def close(self) -> None:
        if hasattr(self, "_client") and self._client is not None:
            await self._client.aclose()

    async def read(
        self,
        address: str | dict,
        value_parser: ValueParser | None = None,
        *,
        context: dict,  # noqa: ARG002
    ) -> AttributeValueType:
        http_address = HttpAddress.from_raw(address)
        response = await self._client.request(
            http_address.method,
            http_address.path,
            data=http_address.body,  # ty: ignore[invalid-argument-type]
        )
        result = response.json()
        if value_parser:
            return value_parser(result)
        return result

    async def write(
        self,
        address: str,
        value: AttributeValueType,
    ) -> None:
        raise NotImplementedError
