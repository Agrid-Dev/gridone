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

# asyncua reports "server offers no endpoint with this policy and mode" as a
# bare UaError carrying this message, with no status code to match on.
NO_MATCHING_ENDPOINT_MESSAGE = "No matching endpoints"


class OpcuaNotConnectedError(ConnectionError):
    """Raised when a read/write is attempted without a live session."""


class OpcuaSecurityError(TerminalConnectionError):
    """Raised when the server rejects the secure channel."""


def is_secure_channel_rejection(exc: Exception) -> bool:
    """Whether ``exc`` is a secure-channel refusal rather than a transient fault."""
    if isinstance(exc, SECURE_CHANNEL_REJECTIONS):
        return True
    # Fallback for the endpoint lookup asyncua repeats internally during
    # create_session; the call this package makes itself is wrapped at its site.
    return isinstance(exc, ua.UaError) and NO_MATCHING_ENDPOINT_MESSAGE in str(exc)


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
