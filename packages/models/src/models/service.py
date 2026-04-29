from abc import ABC, abstractmethod


class Service(ABC):
    """Common shape for every gridone service.

    A subclass takes its ``storage_url`` (and any collaborators) at ``__init__``,
    builds its storage inside ``start``, and tears it down inside ``stop``.

    ``start`` MUST raise ``models.errors.StorageError`` when the storage URL is
    unsupported or unreachable. The composition root in ``apps/api_server`` is
    responsible for ordering ``start`` / ``stop`` calls and propagating failures.

    A ``None`` ``storage_url`` selects the in-memory backend, intended for tests
    and ephemeral runs.
    """

    def __init__(self, storage_url: str | None) -> None:
        self._storage_url = storage_url

    @abstractmethod
    async def start(self) -> None:
        """Build storage and bring the service to a ready state."""

    @abstractmethod
    async def stop(self) -> None:
        """Release storage and any background resources held by the service."""
