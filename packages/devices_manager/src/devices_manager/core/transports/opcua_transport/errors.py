import struct

from asyncua import ua

from devices_manager.core.transports.base import TerminalConnectionError

# Status codes naming a specific standing condition — an untrusted or malformed
# client certificate, or a policy/mode the server will not accept — that stays
# true for every identical retry. BadSecurityChecksFailed is deliberately absent:
# servers also return it for transient channel faults, and a false terminal needs
# an operator to clear it while a false retry only costs a reconnect.
SECURE_CHANNEL_REJECTIONS = (
    ua.uaerrors.BadCertificateHostNameInvalid,
    ua.uaerrors.BadCertificateInvalid,
    ua.uaerrors.BadCertificateRevoked,
    ua.uaerrors.BadCertificateTimeInvalid,
    ua.uaerrors.BadCertificateUntrusted,
    ua.uaerrors.BadCertificateUriInvalid,
    ua.uaerrors.BadCertificateUseNotAllowed,
    ua.uaerrors.BadNoValidCertificates,
    ua.uaerrors.BadSecurityModeInsufficient,
    ua.uaerrors.BadSecurityModeRejected,
    ua.uaerrors.BadSecurityPolicyRejected,
)

# Bare UaErrors asyncua raises with no status code to match on, so these are
# matched by message instead. Both only mean a secure-channel rejection when a
# security policy is actually configured — asyncua re-runs endpoint lookup on
# every connect regardless of security, so on an unsecured transport a bare
# "No matching endpoints" is just a transient server hiccup, not a rejection.
NO_MATCHING_ENDPOINT_MESSAGE = "No matching endpoints"
SERVER_CERTIFICATE_MISMATCH_MESSAGE = "Server certificate mismatch"
SECURE_CHANNEL_REJECTION_MESSAGES = (
    NO_MATCHING_ENDPOINT_MESSAGE,
    SERVER_CERTIFICATE_MISMATCH_MESSAGE,
)


class OpcuaNotConnectedError(ConnectionError):
    """Raised when a read/write is attempted without a live session."""


class OpcuaSecurityError(TerminalConnectionError):
    """Raised when the server rejects the secure channel."""


def is_secure_channel_rejection(
    exc: Exception, *, secure_channel_enabled: bool
) -> bool:
    """Whether ``exc`` is a secure-channel refusal rather than a transient fault."""
    if isinstance(exc, SECURE_CHANNEL_REJECTIONS):
        return True
    if not secure_channel_enabled:
        return False
    return isinstance(exc, ua.UaError) and any(
        message in str(exc) for message in SECURE_CHANNEL_REJECTION_MESSAGES
    )


def translate_write_error(exc: Exception) -> Exception:
    """A value out of range for its target type (e.g. 100000 into an Int16)
    fails ``struct`` encoding before any OPC-UA status code exists, and
    asyncua wraps it in a generic ``Exception`` (chained as ``__cause__``)
    rather than a typed one. A value that can't be coerced to the target
    type at all (e.g. a non-numeric string into an Int32) fails earlier,
    as a direct ``ValueError``/``TypeError``. Both are re-raised here as
    ``BadTypeMismatch``."""
    cause = exc.__cause__
    if isinstance(
        exc, struct.error | OverflowError | ValueError | TypeError
    ) or isinstance(cause, struct.error | OverflowError):
        return ua.uaerrors.BadTypeMismatch(str(exc))
    return exc
