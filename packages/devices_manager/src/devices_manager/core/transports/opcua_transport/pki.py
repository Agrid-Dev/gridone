"""Application-instance PKI for the OPC-UA secure channel.

One certificate identifies the whole gridone instance, reused across restarts:
an operator trusts it once per server, and a regenerated one has to be
re-trusted everywhere. The directory holding it must be mounted persistently.
"""

import asyncio
import hashlib
import logging
import os
import tempfile
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING

from asyncua.crypto.cert_gen import (
    dump_private_key_as_pem,
    generate_private_key,
    generate_self_signed_app_certificate,
)
from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding, load_pem_private_key
from cryptography.x509.oid import ExtendedKeyUsageOID

if TYPE_CHECKING:
    from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey

logger = logging.getLogger(__name__)

PKI_DIR_ENV_VAR = "GRIDONE_OPCUA_PKI_DIR"
DEFAULT_PKI_DIR = Path.home() / ".gridone" / "opcua-pki"

# Both are baked into the certificate and must stay stable: the URI is matched
# against the ApplicationURI gridone advertises (a mismatch is rejected as
# BadCertificateUriInvalid), and asyncua regenerates the certificate whenever
# either stops matching. Deriving the host name from socket.gethostname() would
# therefore regenerate it every time a container comes back with a new hostname,
# silently invalidating the operator's trust.
APPLICATION_URI = "urn:gridone:devices-manager:opcua-client"
CERTIFICATE_HOST_NAME = "gridone"

CLIENT_KEY_FILENAME = "client_key.pem"
CLIENT_CERT_FILENAME = "client_cert.der"
SERVER_PINS_DIRNAME = "servers"
ENDPOINT_DIGEST_CHARS = 16

# The key is written unencrypted onto a shared persistent volume; anyone who can
# read it can impersonate this instance to every server that trusts our cert.
PKI_DIR_MODE = 0o700
PRIVATE_KEY_MODE = 0o600

# asyncua's own 365-day default regenerates silently, parking every server's
# trust at once. Longer lifetime + logged renewal ahead of expiry avoids that.
CERTIFICATE_VALIDITY_DAYS = 1095
CERTIFICATE_RENEWAL_WINDOW_DAYS = 90

# Guards first-use generation: every OPC-UA transport shares one certificate, so
# concurrent connects must not race each other writing the same two files.
_generation_lock = asyncio.Lock()
# Same, for the per-endpoint pin files.
_pin_lock = asyncio.Lock()


def _write_atomically(path: Path, payload: bytes) -> None:
    """Create-or-replace ``path`` in one step: a concurrent reader sees either
    the old contents or the new ones, never a truncated file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent, prefix=f".{path.name}."
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _is_parseable(path: Path, parse: Callable[[bytes], object]) -> bool:
    try:
        payload = path.read_bytes()
    except OSError:
        return False
    if not payload:
        return False
    try:
        parse(payload)
    except (ValueError, TypeError):
        return False
    return True


def _discard_unusable_artifacts(key_file: Path, cert_file: Path) -> None:
    """Delete a truncated/corrupt key or cert so generation treats it as missing."""
    if key_file.exists() and not _is_parseable(
        key_file, lambda data: load_pem_private_key(data, password=None)
    ):
        key_file.unlink(missing_ok=True)
        cert_file.unlink(missing_ok=True)
    elif cert_file.exists() and not _is_parseable(
        cert_file, x509.load_der_x509_certificate
    ):
        cert_file.unlink(missing_ok=True)


def _restrict_permissions(directory: Path, key_file: Path) -> None:
    """Tighten what the generator wrote under the default umask (key 0644)."""
    directory.chmod(PKI_DIR_MODE)
    key_file.chmod(PRIVATE_KEY_MODE)


def _needs_renewal(cert: x509.Certificate) -> bool:
    renew_at = cert.not_valid_after_utc - timedelta(
        days=CERTIFICATE_RENEWAL_WINDOW_DAYS
    )
    return datetime.now(UTC) >= renew_at


def _matches_identity(cert: x509.Certificate) -> bool:
    try:
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    except x509.ExtensionNotFound:
        return False
    return APPLICATION_URI in san.get_values_for_type(
        x509.UniformResourceIdentifier
    ) and CERTIFICATE_HOST_NAME in san.get_values_for_type(x509.DNSName)


def _generate_certificate_and_key(key_file: Path, cert_file: Path) -> None:
    key: RSAPrivateKey = generate_private_key()
    subject_alt_names: list[x509.GeneralName] = [
        x509.UniformResourceIdentifier(APPLICATION_URI),
        x509.DNSName(CERTIFICATE_HOST_NAME),
    ]
    cert = generate_self_signed_app_certificate(
        key,
        APPLICATION_URI,
        {},
        subject_alt_names,
        extended=[ExtendedKeyUsageOID.CLIENT_AUTH],
        days=CERTIFICATE_VALIDITY_DAYS,
    )
    _write_atomically(key_file, dump_private_key_as_pem(key))
    _write_atomically(cert_file, cert.public_bytes(encoding=Encoding.DER))


def pki_dir() -> Path:
    """Directory holding the client certificate and the pinned server certs."""
    configured = os.environ.get(PKI_DIR_ENV_VAR)
    return Path(configured) if configured else DEFAULT_PKI_DIR


def _ensure_client_certificate_sync(
    directory: Path, key_file: Path, cert_file: Path
) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    _discard_unusable_artifacts(key_file, cert_file)

    regenerate = not key_file.is_file() or not cert_file.is_file()
    if not regenerate:
        cert = x509.load_der_x509_certificate(cert_file.read_bytes())
        if not _matches_identity(cert):
            regenerate = True
        elif _needs_renewal(cert):
            logger.warning(
                "OPC-UA client certificate at %s expires %s — renewing now. "
                "It must be re-trusted on every server before the old one "
                "expires, or every secure transport will park at once.",
                cert_file,
                cert.not_valid_after_utc,
            )
            regenerate = True

    if regenerate:
        _generate_certificate_and_key(key_file, cert_file)
    _restrict_permissions(directory, key_file)


async def ensure_client_certificate() -> tuple[Path, Path]:
    """Return ``(cert_file, key_file)``, regenerating when missing, corrupt,
    identity-mismatched, or inside the renewal window."""
    directory = pki_dir()
    key_file = directory / CLIENT_KEY_FILENAME
    cert_file = directory / CLIENT_CERT_FILENAME
    async with _generation_lock:
        await asyncio.to_thread(
            _ensure_client_certificate_sync, directory, key_file, cert_file
        )
    return cert_file, key_file


def server_pin_path(endpoint_url: str) -> Path:
    """Where the trusted certificate for ``endpoint_url`` is pinned.

    Keyed by endpoint digest, not transport id, so two transports pointing at one
    server share a pin and recreating a transport keeps the trust decision.
    """
    digest = hashlib.sha256(endpoint_url.encode()).hexdigest()[:ENDPOINT_DIGEST_CHARS]
    return pki_dir() / SERVER_PINS_DIRNAME / f"{digest}.der"


async def read_server_pin(endpoint_url: str) -> bytes | None:
    """The pinned server certificate, or ``None`` on a first-ever connect."""
    path = server_pin_path(endpoint_url)
    if not await asyncio.to_thread(path.is_file):
        return None
    return await asyncio.to_thread(path.read_bytes)


async def save_server_pin(endpoint_url: str, certificate_der: bytes) -> Path:
    """Pin the certificate this endpoint presented, trusting it from now on."""
    path = server_pin_path(endpoint_url)
    async with _pin_lock:
        await asyncio.to_thread(_write_atomically, path, certificate_der)
    return path
