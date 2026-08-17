import pytest
from pydantic import ValidationError

from devices_manager.core.transports.opcua_transport.transport_config import (
    DEFAULT_CONNECT_TIMEOUT,
    DEFAULT_DEADBAND,
    DEFAULT_KEEPALIVE_INTERVAL,
    DEFAULT_REQUEST_TIMEOUT,
    DEFAULT_SAMPLING_INTERVAL_MS,
    DEFAULT_SECURITY_MODE,
    DEFAULT_SECURITY_POLICY,
    NO_SECURITY,
    SECURED_MODES,
    SECURED_POLICIES,
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
    assert config.sampling_interval_ms == DEFAULT_SAMPLING_INTERVAL_MS
    assert config.deadband == DEFAULT_DEADBAND
    assert config.security_policy == DEFAULT_SECURITY_POLICY == NO_SECURITY
    assert config.security_mode == DEFAULT_SECURITY_MODE == NO_SECURITY


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


def test_config_accepts_custom_sampling_interval_and_deadband() -> None:
    config = OpcuaTransportConfig(
        endpoint_url="opc.tcp://10.0.1.20:4840",
        sampling_interval_ms=250.0,
        deadband=0.5,
    )
    assert config.sampling_interval_ms == 250.0
    assert config.deadband == 0.5


def test_config_rejects_negative_deadband() -> None:
    with pytest.raises(ValidationError, match="deadband"):
        OpcuaTransportConfig(
            endpoint_url="opc.tcp://10.0.1.20:4840",
            deadband=-1.0,
        )


def test_config_rejects_non_positive_sampling_interval() -> None:
    with pytest.raises(ValidationError, match="sampling_interval_ms"):
        OpcuaTransportConfig(
            endpoint_url="opc.tcp://10.0.1.20:4840",
            sampling_interval_ms=0.0,
        )


@pytest.mark.parametrize("security_policy", SECURED_POLICIES)
@pytest.mark.parametrize("security_mode", SECURED_MODES)
def test_config_accepts_full_security_matrix(
    security_policy: str, security_mode: str
) -> None:
    config = OpcuaTransportConfig(
        endpoint_url="opc.tcp://10.0.1.20:4840",
        security_policy=security_policy,  # type: ignore[arg-type]
        security_mode=security_mode,  # type: ignore[arg-type]
    )
    assert config.security_policy == security_policy
    assert config.security_mode == security_mode


@pytest.mark.parametrize(
    "security_policy", ["Basic128Rsa15", "Basic256", "basic256sha256"]
)
def test_config_rejects_unsupported_security_policy(security_policy: str) -> None:
    with pytest.raises(ValidationError, match="security_policy"):
        OpcuaTransportConfig(
            endpoint_url="opc.tcp://10.0.1.20:4840",
            security_policy=security_policy,  # type: ignore[arg-type]
        )


def test_config_rejects_unsupported_security_mode() -> None:
    with pytest.raises(ValidationError, match="security_mode"):
        OpcuaTransportConfig(
            endpoint_url="opc.tcp://10.0.1.20:4840",
            security_policy="Basic256Sha256",
            security_mode="Encrypt",  # type: ignore[arg-type]
        )


@pytest.mark.parametrize(
    ("security_policy", "security_mode"),
    [("Basic256Sha256", NO_SECURITY), (NO_SECURITY, "SignAndEncrypt")],
)
def test_config_rejects_half_configured_security(
    security_policy: str, security_mode: str
) -> None:
    with pytest.raises(ValidationError, match="security_policy and security_mode"):
        OpcuaTransportConfig(
            endpoint_url="opc.tcp://10.0.1.20:4840",
            security_policy=security_policy,  # type: ignore[arg-type]
            security_mode=security_mode,  # type: ignore[arg-type]
        )
