"""Persistence for whole synoptic documents."""

from typing import Protocol

from synoptics.models import Synoptic, SynopticSummary


class SynopticsStorage(Protocol):
    """Stores and returns whole :class:`Synoptic` aggregates.

    Deliberately dumb: a plate is authored, validated and read as one unit, so
    the storage never reasons about symbols or pipes. Every rule lives in the
    service.
    """

    async def create(self, synoptic: Synoptic) -> Synoptic:
        """Store a new plate. Raises :class:`models.errors.ConflictError` when
        a plate already holds its id."""
        ...

    async def get(self, synoptic_id: str) -> Synoptic | None: ...

    async def list_summaries(
        self, *, limit: int | None = None, offset: int | None = None
    ) -> list[SynopticSummary]:
        """Return plate summaries (no symbols, pipes or labels).

        Ordered by creation time then id: the timestamp alone is not unique — a
        bulk import can land several plates on one value — and paging over a
        non-deterministic order repeats some rows and drops others.
        """
        ...

    async def count(self) -> int: ...

    async def update(self, synoptic: Synoptic) -> Synoptic:
        """Persist a full replacement. Raises
        :class:`models.errors.NotFoundError` when no row matches its id."""
        ...

    async def delete(self, synoptic_id: str) -> None:
        """Delete a plate. Raises :class:`models.errors.NotFoundError` when no
        row matches ``synoptic_id``."""
        ...

    async def close(self) -> None: ...
