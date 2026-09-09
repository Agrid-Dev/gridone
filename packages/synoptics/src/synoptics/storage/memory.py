"""In-process plate store. Default backend when no URL is given."""

from dataclasses import dataclass, field

from models.errors import ConflictError, NotFoundError
from synoptics.models import Synoptic, SynopticSummary


@dataclass
class MemoryStorage:
    """Every read and write stores a deep copy, so callers can mutate what they
    get without touching persisted state — the isolation a real database
    gives."""

    _synoptics: dict[str, Synoptic] = field(default_factory=dict)

    async def create(self, synoptic: Synoptic) -> Synoptic:
        if synoptic.id in self._synoptics:
            msg = f"Synoptic {synoptic.id!r} already exists"
            raise ConflictError(msg)
        self._synoptics[synoptic.id] = synoptic.model_copy(deep=True)
        return synoptic.model_copy(deep=True)

    async def get(self, synoptic_id: str) -> Synoptic | None:
        synoptic = self._synoptics.get(synoptic_id)
        return synoptic.model_copy(deep=True) if synoptic is not None else None

    async def list_summaries(
        self, *, limit: int | None = None, offset: int | None = None
    ) -> list[SynopticSummary]:
        synoptics = sorted(
            self._synoptics.values(), key=lambda s: (s.metadata.created_at, s.id)
        )
        if offset is not None:
            synoptics = synoptics[offset:]
        if limit is not None:
            synoptics = synoptics[:limit]
        return [_summary(s) for s in synoptics]

    async def count(self) -> int:
        return len(self._synoptics)

    async def update(self, synoptic: Synoptic) -> Synoptic:
        if synoptic.id not in self._synoptics:
            msg = f"Synoptic {synoptic.id!r} not found"
            raise NotFoundError(msg)
        self._synoptics[synoptic.id] = synoptic.model_copy(deep=True)
        return synoptic.model_copy(deep=True)

    async def delete(self, synoptic_id: str) -> None:
        if synoptic_id not in self._synoptics:
            msg = f"Synoptic {synoptic_id!r} not found"
            raise NotFoundError(msg)
        del self._synoptics[synoptic_id]

    async def close(self) -> None:
        pass


def _summary(synoptic: Synoptic) -> SynopticSummary:
    return SynopticSummary(
        id=synoptic.id,
        name=synoptic.name,
        description=synoptic.description,
        projection=synoptic.projection,
        metadata=synoptic.metadata.model_copy(deep=True),
    )
