"""Message-ingress port: how external HTTP pushes reach a transport.

This is the seam between an HTTP controller (the ``api`` package) and a
transport that accepts pushed messages: the controller translates its own
request object into an :class:`IngressRequest`, so no framework type ever
crosses the package boundary and transports stay testable without a server.
"""

from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class IngressRequest(BaseModel):
    """A pushed message, decoupled from any HTTP framework."""

    topic: str
    """The path after ``/ingress/``, identifying the subscription topic."""

    payload: bytes
    headers: dict[str, str] = {}
    """Request headers, keys lowercased by the caller."""

    query: dict[str, str] = {}


class IngressResult(BaseModel):
    matched: int
    """Number of listeners the message was dispatched to. ``0`` is a valid
    outcome (e.g. a push racing device provisioning), not an error."""


@runtime_checkable
class MessageIngress(Protocol):
    """Implemented by transports that accept pushed messages."""

    async def ingress(self, request: IngressRequest) -> IngressResult: ...
