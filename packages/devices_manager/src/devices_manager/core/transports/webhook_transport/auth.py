import hashlib
import hmac

from models.errors import UnauthorizedError

from .transport_config import WebhookTransportConfig

SIGNATURE_HEADER = "x-signature-256"
SIGNATURE_PREFIX = "sha256="


def _verify_bearer(secret: str, headers: dict[str, str]) -> None:
    expected = f"Bearer {secret}"
    provided = headers.get("authorization", "")
    if not hmac.compare_digest(provided.encode(), expected.encode()):
        msg = "Invalid bearer token"
        raise UnauthorizedError(msg)


def _verify_hmac_sha256(secret: str, headers: dict[str, str], payload: bytes) -> None:
    """Verify an ``x-signature-256: sha256=<hexdigest>`` header, where the
    digest is HMAC-SHA256 of the raw request body keyed with the shared secret
    (same convention as GitHub webhook signatures)."""
    provided = headers.get(SIGNATURE_HEADER, "")
    digest = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    expected = f"{SIGNATURE_PREFIX}{digest}"
    if not hmac.compare_digest(provided.encode(), expected.encode()):
        msg = "Invalid payload signature"
        raise UnauthorizedError(msg)


def verify_ingress_auth(
    config: WebhookTransportConfig, headers: dict[str, str], payload: bytes
) -> None:
    """Check pushed-message credentials against the transport's auth scheme.

    ``headers`` keys must be lowercased by the caller. Raises
    :class:`UnauthorizedError` on failure; comparisons are constant-time.
    """
    if config.auth == "none":
        return
    # The config validator guarantees a secret whenever auth is enabled.
    assert config.secret is not None  # noqa: S101
    if config.auth == "bearer":
        _verify_bearer(config.secret, headers)
    else:
        _verify_hmac_sha256(config.secret, headers, payload)
