from typing import NoReturn

from bacpypes3.apdu import AbortPDU, AbortReason, Error, RejectPDU


class BacnetServiceRejectedError(RuntimeError):
    """The device rejected the confirmed service itself (RejectPDU/AbortPDU),
    not just one transaction like ``Error`` does."""


class BacnetRequestTooLargeError(BacnetServiceRejectedError):
    """Segmentation/buffer-overflow abort: the service works, so retry with a
    smaller RPM chunk instead of disabling RPM for the device."""


_TOO_LARGE_ABORT_REASONS = frozenset(
    {AbortReason.segmentationNotSupported, AbortReason.bufferOverflow}
)


def raise_for_response(response: object, *, target: str, action: str) -> NoReturn:
    """Classify a non-ACK BACnet response and raise accordingly.

    ``RejectPDU``/``AbortPDU`` become :class:`BacnetServiceRejectedError` (or
    the narrower :class:`BacnetRequestTooLargeError` for a too-large abort),
    distinguishing "stop using this service" from "retry smaller". ``Error``
    stays a plain ``RuntimeError`` since it only fails one transaction.
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
