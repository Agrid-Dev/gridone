"""Secure-channel integration tests against an in-process asyncua server."""

import asyncio
import contextlib
from collections.abc import AsyncGenerator, Sequence
from pathlib import Path
from typing import get_args

import pytest
import pytest_asyncio
from asyncua import Server, ua
from asyncua.crypto.cert_gen import setup_self_signed_certificate
from asyncua.crypto.truststore import TrustStore
from asyncua.crypto.validator import CertificateValidator, CertificateValidatorOptions
from conftest import NAMESPACE_URI, free_port
from cryptography.x509.oid import ExtendedKeyUsageOID

from devices_manager.core.transports.opcua_transport import pki
from devices_manager.core.transports.opcua_transport.client import OpcuaTransportClient
from devices_manager.core.transports.opcua_transport.errors import (
    OpcuaNotConnectedError,
    OpcuaSecurityError,
)
from devices_manager.core.transports.opcua_transport.opcua_address import OpcuaAddress
from devices_manager.core.transports.opcua_transport.transport_config import (
    NO_SECURITY,
    OpcuaTransportConfig,
    SecurityModeName,
    SecurityPolicyName,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]

SERVER_APPLICATION_URI = "urn:gridone.test:opcua-server"
SERVER_HOST_NAME = "127.0.0.1"

NODE_NAME = "SecureValue"
INITIAL_VALUE = 42
WRITTEN_VALUE = 7

# Derived from the config vocabulary rather than restated, so a policy or mode
# added there is covered by this matrix without anyone remembering to add it.
SECURED_POLICIES = [
    name for name in get_args(SecurityPolicyName.__value__) if name != NO_SECURITY
]
SECURED_MODES = [
    name for name in get_args(SecurityModeName.__value__) if name != NO_SECURITY
]


@pytest.fixture
def pki_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Isolate the client certificate and the server pins per test."""
    pki_dir = tmp_path / "pki"
    monkeypatch.setenv(pki.PKI_DIR_ENV_VAR, str(pki_dir))
    return pki_dir


async def _server_certificate(directory: Path) -> tuple[Path, Path]:
    await asyncio.to_thread(directory.mkdir, parents=True, exist_ok=True)
    key_file = directory / "server_key.pem"
    cert_file = directory / "server_cert.der"
    await setup_self_signed_certificate(
        key_file,
        cert_file,
        SERVER_APPLICATION_URI,
        SERVER_HOST_NAME,
        [ExtendedKeyUsageOID.SERVER_AUTH],
        {},
    )
    return cert_file, key_file


async def _start_secured_server(
    directory: Path,
    policies: Sequence[ua.SecurityPolicyType],
    certificate_validator: CertificateValidator | None = None,
) -> tuple[Server, str, int]:
    cert_file, key_file = await _server_certificate(directory)
    server = Server()
    await server.init()
    endpoint = f"opc.tcp://127.0.0.1:{free_port()}/gridone/secure/"
    server.set_endpoint(endpoint)
    await server.set_application_uri(SERVER_APPLICATION_URI)
    await server.load_certificate(cert_file)
    await server.load_private_key(key_file)
    server.set_security_policy(list(policies))
    if certificate_validator is not None:
        server.set_certificate_validator(certificate_validator.validate)
    idx = await server.register_namespace(NAMESPACE_URI)
    container = await server.get_objects_node().add_object(idx, "SecureTest")
    node = await container.add_variable(
        ua.NodeId(NODE_NAME, idx),  # ty: ignore[invalid-argument-type]
        NODE_NAME,
        INITIAL_VALUE,
        ua.VariantType.Int32,
    )
    await node.set_writable()
    await server.start()
    return server, endpoint, idx


def _policy_type(
    policy: SecurityPolicyName, mode: SecurityModeName
) -> ua.SecurityPolicyType:
    """asyncua names its server-side endpoint variants ``<Policy>_<Mode>``."""
    return ua.SecurityPolicyType[f"{policy}_{mode}"]


def _client(
    endpoint: str, policy: SecurityPolicyName, mode: SecurityModeName
) -> OpcuaTransportClient:
    return OpcuaTransportClient(
        TransportMetadata(id="opcua-secure-transport", name="opcua-secure-transport"),
        OpcuaTransportConfig(
            endpoint_url=endpoint,
            security_policy=policy,
            security_mode=mode,
        ),
    )


@pytest_asyncio.fixture
async def secured_server(
    tmp_path: Path,
) -> AsyncGenerator[tuple[Server, str, int]]:
    """Server offering every policy/mode this transport supports."""
    policies = [
        _policy_type(policy, mode)
        for policy in SECURED_POLICIES
        for mode in SECURED_MODES
    ]
    server, endpoint, idx = await _start_secured_server(
        tmp_path / "server", [ua.SecurityPolicyType.NoSecurity, *policies]
    )
    try:
        yield server, endpoint, idx
    finally:
        with contextlib.suppress(Exception):
            await server.stop()


class TestSecurityMatrix:
    @pytest.mark.parametrize("policy", SECURED_POLICIES)
    @pytest.mark.parametrize("mode", SECURED_MODES)
    async def test_round_trip_over_secure_channel(
        self,
        secured_server: tuple[Server, str, int],
        pki_home: Path,  # noqa: ARG002
        policy: SecurityPolicyName,
        mode: SecurityModeName,
    ) -> None:
        _, endpoint, idx = secured_server
        address = OpcuaAddress.from_str(f"ns={idx};s={NODE_NAME}")
        client = _client(endpoint, policy, mode)

        await client.connect()
        try:
            assert client.connection_state.is_connected
            assert await client.read(address) == INITIAL_VALUE
            await client.write(address, WRITTEN_VALUE)
            assert await client.read(address) == WRITTEN_VALUE
        finally:
            await client.close()


class TestServerTrust:
    async def test_pins_server_certificate_on_first_connect(
        self,
        secured_server: tuple[Server, str, int],
        pki_home: Path,
    ) -> None:
        _, endpoint, _ = secured_server
        assert await pki.read_server_pin(endpoint) is None
        client = _client(endpoint, "Basic256Sha256", "SignAndEncrypt")

        await client.connect()
        await client.close()

        assert await pki.read_server_pin(endpoint)
        assert pki.server_pin_path(endpoint).parent == (
            pki_home / pki.SERVER_PINS_DIRNAME
        )

    async def test_reuses_pin_on_later_connects(
        self,
        secured_server: tuple[Server, str, int],
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        _, endpoint, _ = secured_server
        client = _client(endpoint, "Basic256Sha256", "SignAndEncrypt")
        await client.connect()
        await client.close()
        first = await pki.read_server_pin(endpoint)
        assert first is not None

        await client.connect()
        await client.close()

        assert await pki.read_server_pin(endpoint) == first

    async def test_rejects_a_server_presenting_another_certificate(
        self,
        secured_server: tuple[Server, str, int],
        pki_home: Path,  # noqa: ARG002
        tmp_path: Path,
    ) -> None:
        """A swapped server certificate must fail the handshake rather than be
        accepted silently, which is the whole point of pinning."""
        server, endpoint, _ = secured_server
        impostor_cert, _ = await _server_certificate(tmp_path / "impostor")
        pin = pki.server_pin_path(endpoint)
        pin.parent.mkdir(parents=True, exist_ok=True)
        pin.write_bytes(impostor_cert.read_bytes())
        client = _client(endpoint, "Basic256Sha256", "SignAndEncrypt")

        with pytest.raises(OpcuaSecurityError, match="does not match the one pinned"):
            await client.connect()

        assert not client.connection_state.is_connected
        # A refusal this package raises itself must short-circuit later connects
        # like a server-reported one; otherwise every read re-runs discovery.
        await server.stop()
        with pytest.raises(OpcuaSecurityError, match="does not match the one pinned"):
            await client.connect()

    async def test_deleting_the_pin_accepts_the_certificate_presented_now(
        self,
        secured_server: tuple[Server, str, int],
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        """The documented remedy for a server that rotated its certificate:
        remove the pin, reconnect, and the first-use step runs again."""
        _, endpoint, _ = secured_server
        pin = pki.server_pin_path(endpoint)
        pin.parent.mkdir(parents=True, exist_ok=True)
        pin.write_bytes(b"a-stale-pin")
        client = _client(endpoint, "Basic256Sha256", "SignAndEncrypt")
        with pytest.raises(OpcuaSecurityError, match="does not match the one pinned"):
            await client.connect()

        pin.unlink()
        client.update_config({}, reconnect=False)
        await client.connect()

        try:
            assert client.connection_state.is_connected
            assert await pki.read_server_pin(endpoint) not in (None, b"a-stale-pin")
        finally:
            await client.close()


class TestSecureChannelRejections:
    async def test_a_rejection_is_not_retried_over_the_network(
        self,
        tmp_path: Path,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        """@connected re-attempts connect() on every read while disconnected, so
        a standing refusal must fail from memory rather than re-run discovery
        and the handshake once per address."""
        server, endpoint, idx = await _start_secured_server(
            tmp_path / "server",
            [
                ua.SecurityPolicyType.NoSecurity,
                ua.SecurityPolicyType.Basic256Sha256_SignAndEncrypt,
            ],
        )
        try:
            client = _client(endpoint, "Aes256Sha256RsaPss", "SignAndEncrypt")
            with pytest.raises(OpcuaSecurityError):
                await client.connect()
            await server.stop()  # nothing may reach the network from here on

            with pytest.raises(OpcuaSecurityError):
                await client.connect()

            # A read goes through @connected, which swallows the connect error
            # and leaves the call to fail on the missing session.
            address = OpcuaAddress.from_str(f"ns={idx};s={NODE_NAME}")
            with pytest.raises(OpcuaNotConnectedError):
                await client.read(address)
        finally:
            with contextlib.suppress(Exception):
                await server.stop()

    async def test_a_config_change_re_arms_a_rejected_transport(
        self,
        tmp_path: Path,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        """The operator's way back: once the refusal is recorded, only a config
        change makes the transport try the network again."""
        server, endpoint, _ = await _start_secured_server(
            tmp_path / "server",
            [
                ua.SecurityPolicyType.NoSecurity,
                ua.SecurityPolicyType.Basic256Sha256_SignAndEncrypt,
            ],
        )
        try:
            client = _client(endpoint, "Aes256Sha256RsaPss", "SignAndEncrypt")
            with pytest.raises(OpcuaSecurityError):
                await client.connect()

            client.update_config({"security_policy": "Basic256Sha256"}, reconnect=False)
            await client.connect()

            assert client.connection_state.is_connected
            await client.close()
        finally:
            await server.stop()

    async def test_policy_the_server_does_not_offer(
        self,
        tmp_path: Path,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        server, endpoint, _ = await _start_secured_server(
            tmp_path / "server",
            [
                ua.SecurityPolicyType.NoSecurity,
                ua.SecurityPolicyType.Basic256Sha256_SignAndEncrypt,
            ],
        )
        try:
            client = _client(endpoint, "Aes256Sha256RsaPss", "SignAndEncrypt")

            with pytest.raises(OpcuaSecurityError):
                await client.connect()

            assert not client.connection_state.is_connected
        finally:
            await server.stop()

    async def test_mode_the_server_does_not_offer(
        self,
        tmp_path: Path,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        server, endpoint, _ = await _start_secured_server(
            tmp_path / "server",
            [
                ua.SecurityPolicyType.NoSecurity,
                ua.SecurityPolicyType.Basic256Sha256_SignAndEncrypt,
            ],
        )
        try:
            client = _client(endpoint, "Basic256Sha256", "Sign")

            with pytest.raises(OpcuaSecurityError):
                await client.connect()
        finally:
            await server.stop()

    async def test_untrusted_client_certificate(
        self,
        tmp_path: Path,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        """An empty trust store stands in for a server where the operator has
        not yet trusted gridone's certificate."""
        trust_store = TrustStore([tmp_path / "empty-trust"], [])
        await trust_store.load()
        validator = CertificateValidator(
            CertificateValidatorOptions.TRUSTED_VALIDATION
            | CertificateValidatorOptions.PEER_CLIENT,
            trust_store,
        )
        server, endpoint, _ = await _start_secured_server(
            tmp_path / "server",
            [
                ua.SecurityPolicyType.NoSecurity,
                ua.SecurityPolicyType.Basic256Sha256_SignAndEncrypt,
            ],
            certificate_validator=validator,
        )
        try:
            client = _client(endpoint, "Basic256Sha256", "SignAndEncrypt")

            with pytest.raises(OpcuaSecurityError):
                await client.connect()

            assert not client.connection_state.is_connected
        finally:
            await server.stop()

    async def test_application_uri_not_matching_the_certificate(
        self,
        tmp_path: Path,
        pki_home: Path,  # noqa: ARG002
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """The URI gridone advertises must match its certificate's URI SAN."""
        validator = CertificateValidator(
            CertificateValidatorOptions.BASIC_VALIDATION
            | CertificateValidatorOptions.PEER_CLIENT
        )
        server, endpoint, _ = await _start_secured_server(
            tmp_path / "server",
            [
                ua.SecurityPolicyType.NoSecurity,
                ua.SecurityPolicyType.Basic256Sha256_SignAndEncrypt,
            ],
            certificate_validator=validator,
        )
        monkeypatch.setattr(
            "devices_manager.core.transports.opcua_transport.security.APPLICATION_URI",
            "urn:gridone:not-the-certificate-uri",
        )
        try:
            client = _client(endpoint, "Basic256Sha256", "SignAndEncrypt")

            with pytest.raises(OpcuaSecurityError):
                await client.connect()
        finally:
            await server.stop()
