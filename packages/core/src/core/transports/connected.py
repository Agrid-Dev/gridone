from collections.abc import Callable, Coroutine
from functools import wraps
from typing import (
    Any,
    ParamSpec,  # For Python < 3.10
    Protocol,
    TypeVar,
)

# Define a type variable for the return type of the decorated method
T_Return = TypeVar("T_Return")

# Define a parameter spec to preserve the signature of the decorated method
P = ParamSpec("P")


class ConnectedProtocol(Protocol):
    """Protocol for classes that use the @connected decorator."""

    async def connect(self) -> None:
        """Connect to the MQTT broker."""
        ...

    @property
    def _is_connected(self) -> bool:
        """Check if the client is connected."""
        ...


def connected[**P, T_Return](
    func: Callable[P, Coroutine[Any, Any, T_Return]],
) -> Callable[P, Coroutine[Any, Any, T_Return]]:
    """Decorator for transport client methods
    ensuring the client is connected before calling the method."""

    @wraps(func)
    async def wrapper(
        self: ConnectedProtocol, *args: P.args, **kwargs: P.kwargs
    ) -> T_Return:
        if not self._is_connected:
            await self.connect()
        return await func(self, *args, **kwargs)

    return wrapper
