import inspect

import httpx

from core.transports import TransportClient
from core.types import AttributeValueType, TransportProtocols
from core.utils.proxy import SocksProxyConfig
from core.value_parsers import ValueParser

from .http_address import HttpAddress

REQUEST_TIMEOUT = 10.0  # s

_HTTPX_ASYNC_CLIENT_PARAMS = inspect.signature(httpx.AsyncClient.__init__).parameters
_PROXY_PARAM_NAME = "proxy" if "proxy" in _HTTPX_ASYNC_CLIENT_PARAMS else "proxies"


class HTTPTransportClient(TransportClient):
    protocol = TransportProtocols.HTTP

    def __init__(
        self,
        *,
        timeout: float = REQUEST_TIMEOUT,
        socks_proxy: SocksProxyConfig | None = None,
    ) -> None:
        self._timeout = timeout
        self._socks_proxy = socks_proxy
        self._client: httpx.AsyncClient | None = None

    def _build_client(self) -> httpx.AsyncClient:
        client_kwargs: dict[str, object] = {"timeout": self._timeout}
        if self._socks_proxy:
            client_kwargs[_PROXY_PARAM_NAME] = self._socks_proxy.url
        return httpx.AsyncClient(**client_kwargs)

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
