"""An explicit device sentinel, distinct from a failed transport or parser."""


class InvalidSampleError(ValueError):
    """The device reported that this measurement is unavailable."""
