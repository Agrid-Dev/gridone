import pytest
from pydantic import ValidationError

from devices_manager.core.transports.opcua_transport.transport_config import (
    DEFAULT_CONNECT_TIMEOUT,
    DEFAULT_KEEPALIVE_INTERVAL,
    DEFAULT_REQUEST_TIMEOUT,
    OpcuaTransportConfig,
)


def test_config_requires_endpoint_url() -> None:
    with pytest.raises(ValidationError, match="endpoint_url"):
        OpcuaTransportConfig()  # type: ignore[call-arg]


@pytest.mark.parametrize(
    ("endpoint_url", "expect_valid"),
    [
        ("opc.tcp://10.0.1.20:4840", True),
        ("http://10.0.1.20:4840", False),
        ("10.0.1.20:4840", False),
    ],
)
def test_config_validates_endpoint_url(endpoint_url: str, expect_valid: bool) -> None:
    if expect_valid:
        config = OpcuaTransportConfig(endpoint_url=endpoint_url)
        assert config.endpoint_url == endpoint_url
    else:
        with pytest.raises(ValidationError, match="Invalid OPC-UA endpoint URL"):
            OpcuaTransportConfig(endpoint_url=endpoint_url)


def test_config_defaults() -> None:
    config = OpcuaTransportConfig(endpoint_url="opc.tcp://10.0.1.20:4840")
    assert config.auth_mode == "anonymous"
    assert config.username is None
    assert config.password is None
    assert config.connect_timeout == DEFAULT_CONNECT_TIMEOUT
    assert config.request_timeout == DEFAULT_REQUEST_TIMEOUT
    assert config.keepalive_interval == DEFAULT_KEEPALIVE_INTERVAL


def test_config_password_is_marked_secret() -> None:
    schema = OpcuaTransportConfig.model_json_schema()
    assert schema["properties"]["password"]["secret"] is True


def test_config_username_password_auth_requires_both() -> None:
    with pytest.raises(ValidationError, match="username and password are required"):
        OpcuaTransportConfig(
            endpoint_url="opc.tcp://10.0.1.20:4840", auth_mode="username_password"
        )


def test_config_username_password_auth_valid() -> None:
    test_password = "secret"  # noqa: S105
    config = OpcuaTransportConfig(
        endpoint_url="opc.tcp://10.0.1.20:4840",
        auth_mode="username_password",
        username="admin",
        password=test_password,
    )
    assert config.username == "admin"
    assert config.password == test_password


def test_config_rejects_invalid_auth_mode() -> None:
    with pytest.raises(ValidationError, match="auth_mode"):
        OpcuaTransportConfig(
            endpoint_url="opc.tcp://10.0.1.20:4840",
            auth_mode="oauth",  # type: ignore[arg-type]
        )
