import httpx
import pytest

from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.core.transports.http_transport.http_address import HttpAddress
from devices_manager.core.transports.read_result import ReadError
from devices_manager.core.transports.transport_metadata import TransportMetadata


def _make_client() -> HTTPTransportClient:
    return HTTPTransportClient(
        TransportMetadata(id="http-1", name="http"), HttpTransportConfig()
    )


def _canned_response(status_code: int, json_body: dict) -> httpx.Response:
    request = httpx.Request("GET", "http://device/attr")
    return httpx.Response(status_code=status_code, json=json_body, request=request)


class TestReadStatusHandling:
    @pytest.mark.asyncio
    async def test_non_2xx_status_raises_via_read(self) -> None:
        client = _make_client()
        await client.connect()
        address = HttpAddress(method="GET", path="device/attr")

        async def fake_request(*_args: object, **_kwargs: object) -> httpx.Response:
            return _canned_response(500, {"error": "boom"})

        client._client.request = fake_request  # type: ignore[method-assign]  # noqa: SLF001

        with pytest.raises(httpx.HTTPStatusError):
            await client.read(address)

    @pytest.mark.asyncio
    async def test_non_2xx_status_yields_read_error_via_read_many(self) -> None:
        client = _make_client()
        await client.connect()
        address = HttpAddress(method="GET", path="device/attr")

        async def fake_request(*_args: object, **_kwargs: object) -> httpx.Response:
            return _canned_response(404, {"error": "not found"})

        client._client.request = fake_request  # type: ignore[method-assign]  # noqa: SLF001

        results = [r async for r in client.read_many([address])]

        assert len(results) == 1
        assert isinstance(results[0], ReadError)
        assert isinstance(results[0].error, httpx.HTTPStatusError)

    @pytest.mark.asyncio
    async def test_2xx_status_still_returns_decoded_json(self) -> None:
        client = _make_client()
        await client.connect()
        address = HttpAddress(method="GET", path="device/attr")

        async def fake_request(*_args: object, **_kwargs: object) -> httpx.Response:
            return _canned_response(200, {"value": 42})

        client._client.request = fake_request  # type: ignore[method-assign]  # noqa: SLF001

        value = await client.read(address)

        assert value == {"value": 42}
