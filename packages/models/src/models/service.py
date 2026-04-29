from typing import Protocol, runtime_checkable


@runtime_checkable
class Service(Protocol):
    """Lifecycle shape every gridone service implements.

    A service stores its ``storage_url`` (and any collaborators) at
    ``__init__``, builds its storage inside ``start``, and tears it down inside
    ``stop``.

    ``start`` MUST raise ``models.errors.UnsupportedStorageError`` when the URL
    scheme is unsupported, and ``models.errors.StorageConnectionError`` when
    the backend cannot be reached or initialized. The composition root in
    ``apps/api_server`` orders ``start`` / ``stop`` calls and propagates
    failures.

    A ``None`` ``storage_url`` selects the in-memory backend, intended for
    tests and ephemeral runs.

    This is a Protocol, not an ABC: services declare conformance structurally
    and stay free of an extra base class, which keeps test mocks and
    dependency injection ergonomic.
    """

    async def start(self) -> None:
        """Build storage and bring the service to a ready state."""
        ...

    async def stop(self) -> None:
        """Release storage and any background resources held by the service."""
        ...
