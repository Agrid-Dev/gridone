from __future__ import annotations

import asyncio
import ipaddress
import os
from collections.abc import Awaitable, Callable, Mapping
from contextlib import suppress
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

StreamFactory = Callable[..., Awaitable[tuple[asyncio.StreamReader, asyncio.StreamWriter]]]


@dataclass(frozen=True)
class SocksProxyConfig:
    host: str
    port: int
    scheme: str = "socks5"

    @property
    def url(self) -> str:
        return f"{self.scheme}://{self.host}:{self.port}"


_installed_proxy: SocksProxyConfig | None = None
_original_open_connection: StreamFactory | None = None


def get_socks_proxy_config(env: Mapping[str, Any] | None = None) -> SocksProxyConfig | None:
    """Return the configured SOCKS proxy without mutating runtime state."""

    return _load_socks_proxy_config(env)


def configure_socks_proxy(
    env: Mapping[str, Any] | None = None,
    *,
    install_asyncio_patch: bool = True,
) -> SocksProxyConfig | None:
    """Load SOCKS proxy settings from env and optionally patch asyncio."""

    config = get_socks_proxy_config(env)
    if config is None:
        return None
    if install_asyncio_patch:
        _install_asyncio_proxy(config)
    return config


def _load_socks_proxy_config(env: Mapping[str, Any] | None) -> SocksProxyConfig | None:
    config = _config_from_mapping(env)
    if config is not None:
        return config
    return _config_from_mapping(os.environ)


def _config_from_mapping(env: Mapping[str, Any] | None) -> SocksProxyConfig | None:
    if not env:
        return None
    normalized = {
        str(key).upper(): str(value)
        for key, value in env.items()
        if value not in (None, "")
    }
    raw_value = normalized.get("SOCKS_PROXY") or normalized.get("ALL_PROXY")
    if raw_value:
        return _parse_proxy_value(raw_value)
    host = normalized.get("SOCKS_PROXY_HOST")
    port = normalized.get("SOCKS_PROXY_PORT")
    if host and port:
        return SocksProxyConfig(
            host=host,
            port=int(port),
            scheme=_normalize_scheme(normalized.get("SOCKS_PROXY_SCHEME", "socks5")),
        )
    return None


def _parse_proxy_value(value: str) -> SocksProxyConfig | None:
    text = value.strip()
    if not text:
        return None
    if "://" not in text:
        text = f"socks5://{text}"
    parsed = urlparse(text)
    if not parsed.hostname or parsed.port is None:
        return None
    return SocksProxyConfig(
        host=parsed.hostname,
        port=parsed.port,
        scheme=_normalize_scheme(parsed.scheme or "socks5"),
    )


def _normalize_scheme(value: str) -> str:
    scheme = value.lower()
    if scheme in {"socks", "socks5", "socks5h"}:
        return "socks5"
    msg = f"Unsupported SOCKS scheme '{value}'"
    raise ValueError(msg)


def _install_asyncio_proxy(config: SocksProxyConfig) -> None:
    global _installed_proxy, _original_open_connection
    if _installed_proxy is not None:
        return

    _original_open_connection = asyncio.open_connection

    async def _patched_open_connection(  # type: ignore[override]
        host: str | None = None,
        port: int | None = None,
        *,
        loop: asyncio.AbstractEventLoop | None = None,
        limit: int = 65536,
        **kwds: Any,
    ) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
        if (
            host is None
            or port is None
            or kwds.get("sock") is not None
            or kwds.get("ssl")
        ):
            return await _original_open_connection(  # type: ignore[misc]
                host,
                port,
                loop=loop,
                limit=limit,
                **kwds,
            )
        return await _open_connection_via_socks(
            config,
            str(host),
            int(port),
            loop=loop,
            limit=limit,
            kwds=kwds,
        )

    asyncio.open_connection = _patched_open_connection
    _installed_proxy = config


async def _open_connection_via_socks(
    config: SocksProxyConfig,
    dest_host: str,
    dest_port: int,
    *,
    loop: asyncio.AbstractEventLoop | None,
    limit: int,
    kwds: dict[str, Any],
) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    assert _original_open_connection is not None
    proxy_kwds = {k: v for k, v in kwds.items() if k not in {"ssl", "server_hostname"}}
    reader, writer = await _original_open_connection(  # type: ignore[misc]
        config.host,
        config.port,
        loop=loop,
        limit=limit,
        **proxy_kwds,
    )
    try:
        await _perform_socks5_handshake(reader, writer, dest_host, dest_port)
    except Exception:
        writer.close()
        with suppress(Exception):
            await writer.wait_closed()
        raise
    return reader, writer


async def _perform_socks5_handshake(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    host: str,
    port: int,
) -> None:
    writer.write(b"\x05\x01\x00")  # version 5, 1 method, no auth
    await writer.drain()
    greeting = await reader.readexactly(2)
    if greeting[0] != 0x05 or greeting[1] != 0x00:
        msg = "SOCKS proxy rejected connection"
        raise OSError(msg)

    request = bytearray(b"\x05\x01\x00")  # version 5, connect, reserved
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        host_bytes = host.encode("idna")
        request.append(0x03)
        request.append(len(host_bytes))
        request.extend(host_bytes)
    else:
        if address.version == 4:
            request.append(0x01)
        else:
            request.append(0x04)
        request.extend(address.packed)
    request.extend(int(port).to_bytes(2, "big"))

    writer.write(request)
    await writer.drain()

    response = await reader.readexactly(4)
    if response[0] != 0x05 or response[1] != 0x00:
        msg = "SOCKS proxy failed to connect"
        raise OSError(msg)

    atyp = response[3]
    if atyp == 0x01:  # IPv4
        await reader.readexactly(4)
    elif atyp == 0x04:  # IPv6
        await reader.readexactly(16)
    elif atyp == 0x03:  # Domain
        domain_length = await reader.readexactly(1)
        await reader.readexactly(domain_length[0])
    await reader.readexactly(2)
