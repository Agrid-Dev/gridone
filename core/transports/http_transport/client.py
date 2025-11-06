import httpx

from core.transports import TransportClient
from core.types import AttributeValueType, TransportProtocols
from core.value_parsers import ValueParser

from .http_address import parse_http_address, render_endpoint

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

    async def read(
        self,
        address: str,
        context: dict,
        value_parser: ValueParser | None = None,
    ) -> AttributeValueType:
        method, raw_endpoint = parse_http_address(address)
        endpoint = render_endpoint(raw_endpoint, context)
        response = await self._client.request(method, endpoint)
        result = response.json()
        if value_parser:
            result = value_parser(result)
        return result

    async def write(
        self,
        address: str,
        value: AttributeValueType,
        context: dict,  # noqa: ARG002
    ) -> None:
        print(
            f"Writing via HTTP to {address} with value {value}",
        )
