from typing import get_args
from unittest.mock import AsyncMock

import pytest
from asyncua import ua

from devices_manager.core.transports.opcua_transport.errors import OpcuaSecurityError
from devices_manager.core.transports.opcua_transport.security import (
    SECURITY_POLICIES,
    _discover_server_certificate,
    resolve_mode,
    resolve_policy,
)
from devices_manager.core.transports.opcua_transport.transport_config import (
    NO_SECURITY,
    SecurityModeName,
    SecurityPolicyName,
)

SECURED_POLICY_NAMES = [
    name for name in get_args(SecurityPolicyName.__value__) if name != NO_SECURITY
]
MODE_NAMES = list(get_args(SecurityModeName.__value__))


@pytest.mark.parametrize("name", SECURED_POLICY_NAMES)
def test_every_configurable_policy_resolves(name: str) -> None:
    """Guards the drift between the config vocabulary and the mapping: an
    unmapped policy would otherwise fail with a KeyError mid-connect."""
    assert resolve_policy(name).URI  # ty: ignore[invalid-argument-type]


def test_no_policy_is_mapped_that_cannot_be_configured() -> None:
    assert set(SECURITY_POLICIES) == set(SECURED_POLICY_NAMES)


@pytest.mark.parametrize("name", MODE_NAMES)
def test_every_configurable_mode_resolves(name: str) -> None:
    resolved = resolve_mode(name)  # ty: ignore[invalid-argument-type]
    assert resolved is not ua.MessageSecurityMode.Invalid


def test_no_security_maps_to_the_protocol_none_member() -> None:
    """OPC-UA's "None" member is spelled None_ in asyncua."""
    assert resolve_mode(NO_SECURITY) == ua.MessageSecurityMode.None_


@pytest.mark.asyncio
async def test_an_endpoint_advertising_no_certificate_is_a_security_error() -> None:
    """asyncua yields None for empty DER; unguarded that is an AttributeError,
    which reads as transient and would be retried without backoff."""
    policy = resolve_policy("Basic256Sha256")
    mode = ua.MessageSecurityMode.SignAndEncrypt
    endpoint = ua.EndpointDescription(
        EndpointUrl="opc.tcp://10.0.1.20:4840",
        SecurityMode=mode,
        SecurityPolicyUri=policy.URI,
        ServerCertificate=b"",
    )
    client = AsyncMock()
    client.connect_and_get_server_endpoints.return_value = [endpoint]

    with pytest.raises(OpcuaSecurityError, match="no certificate"):
        await _discover_server_certificate(
            client, "opc.tcp://10.0.1.20:4840", policy, mode
        )
