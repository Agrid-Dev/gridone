# ruff: noqa: INP001, S101, PLR2004 — importable test helper next to conftest, not a package
"""Folder and archive behaviour that every documents storage must share.

Run once against memory (unit) and once against PostgreSQL (integration), so a
rule cannot hold in one backend and not the other. Names carry a random suffix
because the PostgreSQL database is shared with the other integration tests.
"""

import contextlib

import pytest

from documents import (
    Document,
    DocumentCreate,
    DocumentFilters,
    DocumentsService,
    DocumentUpdate,
    FolderCreate,
    FolderUpdate,
)
from models.errors import ConflictError, InvalidError, NotFoundError
from models.ids import gen_id


async def _upload(
    svc: DocumentsService, name: str, folder_id: str | None = None
) -> Document:
    return await svc.create(
        DocumentCreate(name=name, folder_id=folder_id),
        filename="notice.txt",
        data=b"notice",
        created_by="author",
    )


async def _names(svc: DocumentsService, filters: DocumentFilters) -> set[str]:
    return {document.name for document in (await svc.list(filters=filters)).items}


async def check_folders_and_archives(svc: DocumentsService) -> None:  # noqa: PLR0915
    suffix = gen_id()
    plans = await svc.create_folder(
        FolderCreate(name=f"  Plans {suffix} "), created_by="author"
    )
    level = await svc.create_folder(
        FolderCreate(name=f"Niveau 1 {suffix}", parent_id=plans.id),
        created_by="author",
    )
    documents: list[Document] = []
    try:
        assert plans.name == f"Plans {suffix}"
        assert plans.parent_id is None
        assert plans.archived_at is None
        assert len(plans.id) == 16
        assert level.parent_id == plans.id
        with pytest.raises(InvalidError):
            await svc.create_folder(
                FolderCreate(name="Orphan", parent_id="missing"), created_by="a"
            )
        with pytest.raises(InvalidError):
            await _upload(svc, f"Lost {suffix}", "missing")

        top = await _upload(svc, f"Top {suffix}")
        filed = await _upload(svc, f"Filed {suffix}", level.id)
        documents += [top, filed]
        assert filed.folder_id == level.id

        # Browsing shows direct contents only; searching spans every folder.
        assert await _names(svc, DocumentFilters(q=suffix, top_level=True)) == {
            top.name
        }
        assert await _names(svc, DocumentFilters(folder_id=level.id)) == {filed.name}
        assert await _names(svc, DocumentFilters(folder_id=plans.id)) == set()
        assert await _names(svc, DocumentFilters(q=suffix)) == {top.name, filed.name}

        # Archiving a folder hides its whole subtree, but not the top level.
        archived = await svc.update_folder(plans.id, FolderUpdate(archived=True))
        assert archived.archived_at is not None
        again = await svc.update_folder(plans.id, FolderUpdate(archived=True))
        assert again.archived_at == archived.archived_at
        assert await _names(svc, DocumentFilters(q=suffix)) == {top.name}
        assert await _names(svc, DocumentFilters(folder_id=level.id)) == {filed.name}
        assert await _names(svc, DocumentFilters(q=suffix, archived=True)) == set()

        # A document archived inside a hidden folder still reaches the archives.
        stored = await svc.update(filed.id, DocumentUpdate(archived=True))
        assert stored.archived_at is not None
        assert await _names(svc, DocumentFilters(q=suffix, archived=True)) == {
            filed.name
        }
        assert await _names(svc, DocumentFilters(folder_id=level.id)) == set()

        # Restoring the folder gives back the view, the document keeps its state.
        restored = await svc.update_folder(plans.id, FolderUpdate(archived=False))
        assert restored.archived_at is None
        assert await _names(svc, DocumentFilters(q=suffix)) == {top.name}
        stored = await svc.update(filed.id, DocumentUpdate(archived=False))
        assert stored.archived_at is None
        assert await _names(svc, DocumentFilters(q=suffix)) == {top.name, filed.name}

        # Moving: into another folder, back to the top level, never to a ghost.
        moved = await svc.update(filed.id, DocumentUpdate(folder_id=plans.id))
        assert moved.folder_id == plans.id
        assert moved.name == filed.name
        assert await _names(svc, DocumentFilters(folder_id=plans.id)) == {filed.name}
        with pytest.raises(InvalidError):
            await svc.update(filed.id, DocumentUpdate(folder_id="missing"))
        renamed = await svc.update(filed.id, DocumentUpdate(name=f"Kept {suffix}"))
        assert renamed.folder_id == plans.id

        # Only an empty folder can be deleted, archived contents included.
        with pytest.raises(ConflictError):
            await svc.delete_folder(plans.id)
        await svc.delete_folder(level.id)
        await svc.update(filed.id, DocumentUpdate(archived=True))
        with pytest.raises(ConflictError):
            await svc.delete_folder(plans.id)
        unfiled = await svc.update(filed.id, DocumentUpdate(folder_id=None))
        assert unfiled.folder_id is None
        assert unfiled.archived_at is not None
        assert await _names(svc, DocumentFilters(q=suffix, top_level=True)) == {
            top.name
        }

        renamed_folder = await svc.update_folder(
            plans.id, FolderUpdate(name=f" Plans v2 {suffix}")
        )
        assert renamed_folder.name == f"Plans v2 {suffix}"
        names = [f.name for f in await svc.list_folders() if suffix in f.name]
        assert names == [f"Plans v2 {suffix}"]
        await svc.delete_folder(plans.id)
        with pytest.raises(NotFoundError):
            await svc.delete_folder(plans.id)
        with pytest.raises(NotFoundError):
            await svc.update_folder(plans.id, FolderUpdate(name="Gone"))
    finally:
        for document in documents:
            with contextlib.suppress(NotFoundError):
                await svc.delete(document.id)
        for folder in (level, plans):
            with contextlib.suppress(NotFoundError):
                await svc.delete_folder(folder.id)


async def check_subfolders_block_deletion_and_archive_dates_stick(
    svc: DocumentsService,
) -> None:
    """A lone subfolder, even archived, keeps its parent; archive dates stick."""
    suffix = gen_id()
    parent = await svc.create_folder(
        FolderCreate(name=f"Parent {suffix}"), created_by="author"
    )
    child = await svc.create_folder(
        FolderCreate(name=f"Child {suffix}", parent_id=parent.id),
        created_by="author",
    )
    documents: list[Document] = []
    try:
        # The parent holds nothing but a subfolder: active, then archived.
        with pytest.raises(ConflictError):
            await svc.delete_folder(parent.id)
        await svc.update_folder(child.id, FolderUpdate(archived=True))
        with pytest.raises(ConflictError):
            await svc.delete_folder(parent.id)
        assert {parent.id, child.id} <= {f.id for f in await svc.list_folders()}

        # A document keeps its first archive date when archived again or renamed.
        top = await svc.create(
            DocumentCreate(name=f"Top {suffix}", asset_ids=[suffix]),
            filename="notice.txt",
            data=b"notice",
            created_by="author",
        )
        documents.append(top)
        first = await svc.update(top.id, DocumentUpdate(archived=True))
        assert first.archived_at is not None
        again = await svc.update(top.id, DocumentUpdate(archived=True))
        assert again.archived_at == first.archived_at
        renamed = await svc.update(top.id, DocumentUpdate(name=f"Top v2 {suffix}"))
        assert renamed.archived_at == first.archived_at
        restored = await svc.update(top.id, DocumentUpdate(archived=False))
        assert restored.archived_at is None

        # An asset card spans folders: the archived child's documents leave it,
        # the parent's and the top level's stay.
        for name, folder_id in [("Shown", parent.id), ("Hidden", child.id)]:
            documents.append(
                await svc.create(
                    DocumentCreate(
                        name=f"{name} {suffix}", folder_id=folder_id, asset_ids=[suffix]
                    ),
                    filename="notice.txt",
                    data=b"notice",
                    created_by="author",
                )
            )
        assert await _names(svc, DocumentFilters(asset_id=suffix)) == {
            f"Top v2 {suffix}",
            f"Shown {suffix}",
        }
        assert await _names(svc, DocumentFilters(folder_id=child.id)) == {
            f"Hidden {suffix}"
        }
    finally:
        for document in documents:
            with contextlib.suppress(NotFoundError):
                await svc.delete(document.id)
        for folder in (child, parent):
            with contextlib.suppress(NotFoundError, ConflictError):
                await svc.delete_folder(folder.id)
