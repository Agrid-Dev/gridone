import asyncio
from pathlib import Path

import pytest
from asyncua.crypto.cert_gen import (
    dump_private_key_as_pem,
    generate_private_key,
    generate_self_signed_app_certificate,
)
from asyncua.crypto.uacrypto import load_certificate
from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding, load_pem_private_key
from cryptography.x509.oid import ExtendedKeyUsageOID

from devices_manager.core.transports.opcua_transport.pki import (
    APPLICATION_URI,
    CERTIFICATE_HOST_NAME,
    CERTIFICATE_RENEWAL_WINDOW_DAYS,
    CLIENT_CERT_FILENAME,
    CLIENT_KEY_FILENAME,
    DEFAULT_PKI_DIR,
    PKI_DIR_ENV_VAR,
    PKI_DIR_MODE,
    PRIVATE_KEY_MODE,
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


def _write_certificate(directory: Path, days_left: int) -> None:
    """Write a valid key + certificate expiring ``days_left`` from now."""
    key = generate_private_key()
    cert = generate_self_signed_app_certificate(
        key,
        APPLICATION_URI,
        {},
        [
            x509.UniformResourceIdentifier(APPLICATION_URI),
            x509.DNSName(CERTIFICATE_HOST_NAME),
        ],
        extended=[ExtendedKeyUsageOID.CLIENT_AUTH],
        days=days_left,
    )
    (directory / CLIENT_KEY_FILENAME).write_bytes(dump_private_key_as_pem(key))
    (directory / CLIENT_CERT_FILENAME).write_bytes(
        cert.public_bytes(encoding=Encoding.DER)
    )


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

    async def test_private_key_and_directory_are_not_world_readable(
        self, pki_home: Path
    ) -> None:
        """The key is unencrypted on a shared volume: anyone who can read it can
        impersonate this instance to every server that trusts the certificate."""
        _, key_file = await ensure_client_certificate()

        assert key_file.stat().st_mode & 0o777 == PRIVATE_KEY_MODE
        assert pki_home.stat().st_mode & 0o777 == PKI_DIR_MODE  # noqa: ASYNC240

    @pytest.mark.parametrize("corrupt", [b"", b"not-a-key"])
    async def test_regenerates_corrupt_private_key(
        self,
        pki_home: Path,  # noqa: ARG002
        corrupt: bytes,
    ) -> None:
        """A connect cancelled mid-write leaves a truncated key; asyncua only
        rewrites missing artifacts, so without a discard pass it never recovers."""
        cert_file, key_file = await ensure_client_certificate()
        key_file.write_bytes(corrupt)

        await ensure_client_certificate()

        assert key_file.read_bytes() != corrupt
        assert load_pem_private_key(key_file.read_bytes(), password=None)
        assert cert_file.is_file()

    async def test_regenerates_corrupt_certificate(
        self,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        cert_file, _ = await ensure_client_certificate()
        cert_file.write_bytes(b"")

        await ensure_client_certificate()

        assert x509.load_der_x509_certificate(cert_file.read_bytes())

    async def test_renews_a_certificate_inside_the_renewal_window(
        self,
        pki_home: Path,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """A cert nearing expiry is replaced before it actually expires, so an
        operator has time to re-trust the new one everywhere."""
        _write_certificate(pki_home, days_left=CERTIFICATE_RENEWAL_WINDOW_DAYS - 1)
        cert_file = pki_home / CLIENT_CERT_FILENAME
        old_cert = cert_file.read_bytes()

        await ensure_client_certificate()

        assert cert_file.read_bytes() != old_cert
        assert "renewing" in caplog.text

    async def test_does_not_renew_outside_the_renewal_window(
        self,
        pki_home: Path,
    ) -> None:
        _write_certificate(pki_home, days_left=CERTIFICATE_RENEWAL_WINDOW_DAYS + 1)
        cert_file = pki_home / CLIENT_CERT_FILENAME
        old_cert = cert_file.read_bytes()

        await ensure_client_certificate()

        assert cert_file.read_bytes() == old_cert


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

    async def test_replaces_an_existing_pin_without_leaving_temporaries(
        self,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        """The write goes through a temp file + rename, so a reader never sees a
        truncated pin — which no code path would ever repair."""
        await save_server_pin(ENDPOINT, b"first")
        path = await save_server_pin(ENDPOINT, b"second")

        assert await read_server_pin(ENDPOINT) == b"second"
        assert list(path.parent.iterdir()) == [path]

    async def test_concurrent_first_pins_never_read_a_partial_file(
        self,
        pki_home: Path,  # noqa: ARG002
    ) -> None:
        """Two transports sharing one endpoint first-connect together."""
        await asyncio.gather(
            *(save_server_pin(ENDPOINT, b"server-der-bytes") for _ in range(5))
        )

        assert await read_server_pin(ENDPOINT) == b"server-der-bytes"
