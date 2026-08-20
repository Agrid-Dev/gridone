import logging
from collections.abc import Callable, Coroutine
from functools import wraps
from typing import (
    Any,
    ParamSpec,  # For Python < 3.10
    Protocol,
    TypeVar,
)

from .transport_connection_state import TransportConnectionState

logger = logging.getLogger(__name__)

T_Return = TypeVar("T_Return")

P = ParamSpec("P")


class ConnectedProtocol(Protocol):
    """Protocol for classes that use the @connected decorator."""

    connection_state: TransportConnectionState

    async def ensure_connected(self) -> None:
        """Connect unless a previous attempt failed terminally."""
        ...

    def _attempt_is_current(self) -> bool:
        """False if a newer config has superseded the attempt that just failed."""
        ...

    @property
    def id(self) -> str:
        """Returns the id of the client (for logging mainly)."""


def connected[**P, T_Return](
    func: Callable[P, Coroutine[Any, Any, T_Return]],
) -> Callable[P, Coroutine[Any, Any, T_Return]]:
    """Decorator for transport client methods
    ensuring the client is connected before calling the method."""

    @wraps(func)
    async def wrapper(
        self: ConnectedProtocol, *args: P.args, **kwargs: P.kwargs
    ) -> T_Return:
        if not self.connection_state.is_connected:
            try:
                await self.ensure_connected()
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "Connection attempt for transport %s failed — %s: %s",
                    self.id,
                    type(e).__name__,
                    e,
                )
                # Don't let a stale (superseded) attempt clobber fresher state.
                if self._attempt_is_current():
                    self.connection_state = TransportConnectionState.connection_error(
                        str(e)
                    )
        return await func(self, *args, **kwargs)  # ty:ignore[invalid-argument-type]

    return wrapper  # ty:ignore[invalid-return-type]
