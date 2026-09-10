"""Owns synoptic documents: validate, store, read back."""

from datetime import datetime
from typing import Any

from models.errors import NotFoundError
from models.ids import gen_id
from models.metadata import ResourceMetadata
from models.pagination import Page, PaginationParams
from models.service import Service
from models.targets import TargetResolver
from synoptics.interface import SynopticsServiceInterface
from synoptics.models import Synoptic, SynopticDocument, SynopticSummary
from synoptics.storage import build_storage
from synoptics.storage.protocol import SynopticsStorage
from synoptics.symbols.registry import SymbolRegistry, build_default_registry
from synoptics.validation import validate_bindings, validate_document


class SynopticsService(SynopticsServiceInterface, Service):
    """A plate is written whole and read whole.

    There are no per-element operations: every save-time rule spans the
    document (ids are unique across it, a pipe attaches to a symbol's port, a
    tee lands on another run), so validating a fragment would mean loading the
    rest anyway. The editor, when it exists, sends the document it has.

    Bindings are resolved through the injected ``target_resolver`` on every
    save, so a plate whose binding matches no device, or several, is refused
    here whatever the caller. Resolution itself stays composition work: the
    resolver comes from the API layer.
    """

    _storage: SynopticsStorage

    def __init__(
        self,
        storage_url: str | None,
        target_resolver: TargetResolver,
        registry: SymbolRegistry | None = None,
    ) -> None:
        self._storage_url = storage_url
        self._target_resolver = target_resolver
        self._registry = registry or build_default_registry()

    async def start(self) -> None:
        self._storage = await build_storage(self._storage_url)

    async def stop(self) -> None:
        if hasattr(self, "_storage"):
            await self._storage.close()

    async def create(self, document: SynopticDocument) -> Synoptic:
        await self._validate(document)
        synoptic = _with_envelope(document, gen_id(), ResourceMetadata())
        return await self._storage.create(synoptic)

    async def get(self, synoptic_id: str) -> Synoptic:
        synoptic = await self._storage.get(synoptic_id)
        if synoptic is None:
            msg = f"Synoptic {synoptic_id!r} not found"
            raise NotFoundError(msg)
        return synoptic

    async def list(
        self, *, pagination: PaginationParams | None = None
    ) -> Page[SynopticSummary]:
        total = await self._storage.count()
        if pagination is not None:
            items = await self._storage.list_summaries(
                limit=pagination.limit, offset=pagination.offset
            )
            return Page(
                items=items, total=total, page=pagination.page, size=pagination.size
            )
        items = await self._storage.list_summaries()
        return Page(items=items, total=total, page=1, size=max(total, 1))

    async def replace(
        self,
        synoptic_id: str,
        document: SynopticDocument,
        *,
        expected_updated_at: datetime | None = None,
    ) -> Synoptic:
        """Replace a plate's whole document, keeping its id and creation time.

        A plate is edited whole and an edit can take a while, so two authors
        can overlap; without a check the second save silently erases the first.
        Pass ``expected_updated_at`` (the ``updated_at`` the author read) to
        have the save refused with :class:`models.errors.ConflictError` if the
        plate moved underneath them. The storage conditions its write on that
        timestamp, so a change landing between the read here and the write is
        caught by the same check.
        """
        existing = await self.get(synoptic_id)
        await self._validate(document)
        synoptic = _with_envelope(
            document, synoptic_id, existing.metadata.touch_updated_at()
        )
        return await self._storage.update(
            synoptic,
            seen_updated_at=expected_updated_at or existing.metadata.updated_at,
        )

    async def delete(self, synoptic_id: str) -> None:
        await self._storage.delete(synoptic_id)

    async def _validate(self, document: SynopticDocument) -> None:
        validate_document(document, self._registry)
        await validate_bindings(document, self._target_resolver)

    def symbol_schemas(self) -> dict[str, dict[str, Any]]:
        """A JSON Schema per registered symbol type."""
        return self._registry.schemas()


def _with_envelope(
    document: SynopticDocument, synoptic_id: str, metadata: ResourceMetadata
) -> Synoptic:
    """Wrap an authored document in the service-assigned id and metadata."""
    return Synoptic.model_validate(
        {
            **document.model_dump(by_alias=True),
            "id": synoptic_id,
            "metadata": metadata,
        }
    )
