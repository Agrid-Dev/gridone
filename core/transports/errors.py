class TransportError(Exception):
    """Base class for all transport-related errors."""


class TransportConnectionError(TransportError, ConnectionError):
    """Raised when a connection cannot be established."""


class TransportTimeoutError(TransportError, TimeoutError):
    """Raised when a transport operation times out."""


class ProtocolError(TransportError):
    """Raised when there is a protocol-specific error
    (e.g., invalid Modbus/BACnet frame)."""


class InvalidAddressError(TransportError, ValueError):
    """Raised when  the address provided is invalid or can't be parsed."""


class ReadError(TransportError):
    """Raised when a read operation fails."""


class WriteError(TransportError):
    """Raised when a write operation fails."""
