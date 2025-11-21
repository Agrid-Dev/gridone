import pytest

from core.utils.proxy import SocksProxyConfig, get_socks_proxy_config


def test_get_socks_proxy_from_url() -> None:
    config = get_socks_proxy_config({"SOCKS_PROXY": "localhost:8080"})
    assert isinstance(config, SocksProxyConfig)
    assert config.host == "localhost"
    assert config.port == 8080
    assert config.url == "socks5://localhost:8080"


def test_get_socks_proxy_from_host_and_port() -> None:
    config = get_socks_proxy_config(
        {
            "socks_proxy_host": "127.0.0.1",
            "SOCKS_PROXY_PORT": "1080",
        },
    )
    assert isinstance(config, SocksProxyConfig)
    assert config.host == "127.0.0.1"
    assert config.port == 1080


def test_invalid_scheme_raises_value_error() -> None:
    with pytest.raises(ValueError):
        get_socks_proxy_config({"SOCKS_PROXY": "http://localhost:8080"})
