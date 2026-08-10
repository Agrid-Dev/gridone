from typing import NoReturn

from bacpypes3.apdu import AbortPDU, AbortReason, Error, RejectPDU


class BacnetServiceRejectedError(RuntimeError):
    """The device rejected the confirmed service itself (RejectPDU/AbortPDU),
    not just one transaction — distinct from ``Error``, which only fails the
    request that carried it."""


class BacnetRequestTooLargeError(BacnetServiceRejectedError):
    """The device aborted because the request/response wouldn't fit
    unsegmented (segmentation-not-supported/buffer-overflow) — the service
    itself works, so callers should retry with a smaller RPM chunk instead of
    disabling RPM for the device."""


_TOO_LARGE_ABORT_REASONS = frozenset(
    {AbortReason.segmentationNotSupported, AbortReason.bufferOverflow}
)


def raise_for_response(response: object, *, target: str, action: str) -> NoReturn:
    """Classify a non-ACK BACnet response and raise accordingly.

    ``Error`` means only this one transaction failed (e.g. one bad
    property). ``RejectPDU``/``AbortPDU`` mean the device rejected the
    confirmed *service* itself (e.g. RPM unrecognized) — raised as
    :class:`BacnetServiceRejectedError` so callers can distinguish "this
    read failed" from "stop attempting this service on this device". An
    abort caused by the response being too large to fit unsegmented is
    raised as the narrower :class:`BacnetRequestTooLargeError` so callers can
    retry smaller instead of giving up on the service entirely.
    """
    if isinstance(response, Error):
        msg = (
            f"BACnet error on {action} to {target}: "
            f"{response.errorClass}:{response.errorCode}"
        )
        raise RuntimeError(msg)  # noqa: TRY004
    if isinstance(response, RejectPDU):
        msg = f"BACnet reject on {action} to {target}: rejectReason={response.reason}"
        raise BacnetServiceRejectedError(msg)
    if isinstance(response, AbortPDU):
        msg = f"BACnet abort on {action} to {target}: abortReason={response.reason}"
        if response.reason in _TOO_LARGE_ABORT_REASONS:
            raise BacnetRequestTooLargeError(msg)
        raise BacnetServiceRejectedError(msg)
    msg = f"Unexpected response to {action}: {response!r}"
    raise TypeError(msg)
