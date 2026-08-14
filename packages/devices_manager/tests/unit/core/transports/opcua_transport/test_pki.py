from pathlib import Path

import pytest
from asyncua.crypto.uacrypto import load_certificate
from cryptography import x509

from devices_manager.core.transports.opcua_transport.pki import (
    APPLICATION_URI,
    CERTIFICATE_HOST_NAME,
    DEFAULT_PKI_DIR,
    PKI_DIR_ENV_VAR,
    ensure_client_certificate,
    pki_dir,
    read_server_pin,
    save_server_pin,
    server_pin_path,
)

ENDPOINT = "opc.tcp://10.0.1.20:4840/gridone/"
OTHER_ENDPOINT = "opc.tcp://10.0.1.21:4840/gridone/"


@pytest.fixture
def pki_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv(PKI_DIR_ENV_VAR, str(tmp_path))
    return tmp_path


class TestPkiDir:
    def test_defaults_when_env_var_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv(PKI_DIR_ENV_VAR, raising=False)
        assert pki_dir() == DEFAULT_PKI_DIR

    def test_reads_env_var(self, pki_home: Path) -> None:
        assert pki_dir() == pki_home


class TestClientCertificate:
    pytestmark = pytest.mark.asyncio

    async def test_generates_certificate_and_key(self, pki_home: Path) -> None:
        cert_file, key_file = await ensure_client_certificate()

        assert cert_file.is_file()
        assert key_file.is_file()
        assert cert_file.parent == pki_home

    async def test_certificate_carries_application_uri_and_host_name(
        self,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        """The URI SAN is what a server matches against the ApplicationURI
        gridone advertises; a mismatch is rejected as BadCertificateUriInvalid."""
        cert_file, _ = await ensure_client_certificate()

        certificate = await load_certificate(cert_file)
        san = certificate.extensions.get_extension_for_class(
            x509.SubjectAlternativeName
        ).value
        assert APPLICATION_URI in san.get_values_for_type(
            x509.UniformResourceIdentifier
        )
        assert CERTIFICATE_HOST_NAME in san.get_values_for_type(x509.DNSName)

    async def test_reuses_existing_certificate(
        self,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        """Regenerating would invalidate the operator's server-side trust, so a
        second call must leave both artifacts byte-for-byte identical."""
        cert_file, key_file = await ensure_client_certificate()
        first_cert, first_key = cert_file.read_bytes(), key_file.read_bytes()

        await ensure_client_certificate()

        assert cert_file.read_bytes() == first_cert
        assert key_file.read_bytes() == first_key

    async def test_regenerates_when_certificate_is_missing(
        self,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        cert_file, _ = await ensure_client_certificate()
        cert_file.unlink()

        again_cert_file, _ = await ensure_client_certificate()

        assert again_cert_file.is_file()


class TestServerPin:
    pytestmark = pytest.mark.asyncio

    async def test_absent_before_first_connect(
        self,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        assert await read_server_pin(ENDPOINT) is None

    async def test_round_trips_pinned_certificate(
        self,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        await save_server_pin(ENDPOINT, b"server-der-bytes")

        assert await read_server_pin(ENDPOINT) == b"server-der-bytes"

    async def test_is_keyed_by_endpoint(
        self,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        await save_server_pin(ENDPOINT, b"server-der-bytes")

        assert await read_server_pin(OTHER_ENDPOINT) is None
        assert server_pin_path(ENDPOINT) == server_pin_path(ENDPOINT)
