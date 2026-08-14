"""Application-instance PKI for the OPC-UA secure channel.

One certificate identifies the whole gridone instance, reused across restarts:
an operator trusts it once per server, and a regenerated one has to be
re-trusted everywhere. The directory holding it must be mounted persistently.
"""

import asyncio
import hashlib
import os
from pathlib import Path

from asyncua.crypto.cert_gen import setup_self_signed_certificate
from cryptography.x509.oid import ExtendedKeyUsageOID

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

# Guards first-use generation: every OPC-UA transport shares one certificate, so
# concurrent connects must not race each other writing the same two files.
_generation_lock = asyncio.Lock()


def pki_dir() -> Path:
    """Directory holding the client certificate and the pinned server certs."""
    configured = os.environ.get(PKI_DIR_ENV_VAR)
    return Path(configured) if configured else DEFAULT_PKI_DIR


async def ensure_client_certificate() -> tuple[Path, Path]:
    """Return ``(cert_file, key_file)``, generating them only on first use.

    asyncua rewrites either artifact when it is missing, expired, or no longer
    matches :data:`APPLICATION_URI`, and leaves an existing valid pair alone.
    """
    directory = pki_dir()
    key_file = directory / CLIENT_KEY_FILENAME
    cert_file = directory / CLIENT_CERT_FILENAME
    async with _generation_lock:
        await asyncio.to_thread(directory.mkdir, parents=True, exist_ok=True)
        await setup_self_signed_certificate(
            key_file,
            cert_file,
            APPLICATION_URI,
            CERTIFICATE_HOST_NAME,
            [ExtendedKeyUsageOID.CLIENT_AUTH],
            {},
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
    await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)
    await asyncio.to_thread(path.write_bytes, certificate_der)
    return path
