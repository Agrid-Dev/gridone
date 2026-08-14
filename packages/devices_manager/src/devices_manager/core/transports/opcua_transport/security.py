"""Secure-channel setup: policy/mode selection and server-certificate trust."""

import logging

from asyncua import Client, ua
from asyncua.crypto import security_policies, uacrypto
from cryptography.hazmat.primitives.serialization import Encoding

from .errors import OpcuaSecurityError
from .pki import (
    APPLICATION_URI,
    ensure_client_certificate,
    read_server_pin,
    save_server_pin,
    server_pin_path,
)
from .transport_config import (
    OpcuaTransportConfig,
    SecurityModeName,
    SecurityPolicyName,
)

logger = logging.getLogger(__name__)

# Explicit rather than resolved by name off the security_policies module: an
# unknown policy has to fail as a config error, not as an AttributeError raised
# halfway through a connect.
SECURITY_POLICIES: dict[str, type[security_policies.SecurityPolicy]] = {
    "Basic256Sha256": security_policies.SecurityPolicyBasic256Sha256,
    "Aes128Sha256RsaOaep": security_policies.SecurityPolicyAes128Sha256RsaOaep,
    "Aes256Sha256RsaPss": security_policies.SecurityPolicyAes256Sha256RsaPss,
}


def resolve_policy(name: SecurityPolicyName) -> type[security_policies.SecurityPolicy]:
    return SECURITY_POLICIES[name]


def resolve_mode(name: SecurityModeName) -> ua.MessageSecurityMode:
    # asyncua spells OPC-UA's "None" member None_; the others match the config
    # vocabulary as-is.
    return ua.MessageSecurityMode[name.replace("None", "None_")]


async def apply_security(client: Client, config: OpcuaTransportConfig) -> None:
    """Configure ``client``'s secure channel. Must run before ``connect()``.

    Trust is pin-on-first-use: the certificate a server presents on the first
    connect is stored and required on every connect after that, so a swapped
    server certificate is refused instead of being accepted silently. Deleting
    the pin file re-arms the first-use step; an operator who wants strict trust
    from the start can drop the expected certificate there instead.
    """
    policy = resolve_policy(config.security_policy)
    mode = resolve_mode(config.security_mode)
    # Set here rather than for every session: it must match the URI SAN of the
    # certificate below, and unsecured transports keep advertising whatever they
    # advertised before.
    client.application_uri = APPLICATION_URI
    certificate, private_key = await ensure_client_certificate()
    server_certificate = await _trusted_server_certificate(
        client, config.endpoint_url, policy, mode
    )
    await client.set_security(
        policy,
        certificate,
        private_key,
        # DER bytes rather than a path: set_security accepts a Path for the
        # client artifacts but not for the server one.
        server_certificate=uacrypto.CertProperties(server_certificate, "der"),
        mode=mode,
    )


async def _trusted_server_certificate(
    client: Client,
    endpoint_url: str,
    policy: type[security_policies.SecurityPolicy],
    mode: ua.MessageSecurityMode,
) -> bytes:
    """Resolve the server certificate to trust, pinning it on first connect.

    The advertised certificate is fetched even when a pin exists, so a mismatch
    is caught here and reported. Left to the handshake, the same mismatch would
    surface only as a connect timeout: the server silently fails to decrypt a
    message sealed with the wrong public key, and a timeout is retryable, so the
    transport would reconnect against an impostor forever instead of stopping.
    """
    advertised = await _discover_server_certificate(client, endpoint_url, policy, mode)
    pinned = await read_server_pin(endpoint_url)
    if pinned is None:
        await save_server_pin(endpoint_url, advertised)
        logger.info("Pinned server certificate for %s on first connect", endpoint_url)
    elif pinned != advertised:
        # Naming the pin file matters: a server that legitimately rotated its
        # certificate is indistinguishable from an impostor here, and deleting
        # this file is the only way to accept the new one.
        msg = (
            f"Server certificate for {endpoint_url} does not match the one pinned "
            f"at {server_pin_path(endpoint_url)}. Delete that file to trust the "
            f"certificate the server presents now."
        )
        raise OpcuaSecurityError(msg)
    return advertised


async def _discover_server_certificate(
    client: Client,
    endpoint_url: str,
    policy: type[security_policies.SecurityPolicy],
    mode: ua.MessageSecurityMode,
) -> bytes:
    """Read the certificate the endpoint advertises, over an unsecured throwaway
    channel — all the discovery service needs, and all that is available before
    a policy has been set."""
    endpoints = await client.connect_and_get_server_endpoints()
    endpoint = Client.find_endpoint(endpoints, mode, policy.URI)
    # ServerCertificate may be a DER chain; x509_from_der takes the leaf, which
    # is the certificate the handshake is verified against.
    certificate = uacrypto.x509_from_der(endpoint.ServerCertificate)
    if certificate is None:
        # x509_from_der yields None for empty DER. Left unguarded this would be
        # an AttributeError, which reads as a transient fault and gets retried.
        msg = f"Endpoint {endpoint_url} offers a secure policy but no certificate"
        raise OpcuaSecurityError(msg)
    return certificate.public_bytes(Encoding.DER)
