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


async def _linked(
    svc: DocumentsService, name: str, folder_id: str, asset_id: str
) -> Document:
    return await svc.create(
        DocumentCreate(name=name, folder_id=folder_id, asset_ids=[asset_id]),
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
        # Filed before the child is archived: nothing lands in it afterwards.
        documents.append(await _linked(svc, f"Hidden {suffix}", child.id, suffix))
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
        documents.append(await _linked(svc, f"Shown {suffix}", parent.id, suffix))
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


async def check_hidden_folders_are_read_only(svc: DocumentsService) -> None:
    """Nothing new lands in a folder that an archived folder hides.

    Each folder also says which archived folder hides it, so no client has to
    walk the tree again.
    """
    suffix = gen_id()
    plans = await svc.create_folder(
        FolderCreate(name=f"Plans {suffix}"), created_by="author"
    )
    level = await svc.create_folder(
        FolderCreate(name=f"Level {suffix}", parent_id=plans.id), created_by="author"
    )
    open_folder = await svc.create_folder(
        FolderCreate(name=f"Open {suffix}"), created_by="author"
    )
    folders = (level, plans, open_folder)
    documents: list[Document] = []
    try:
        filed = await _upload(svc, f"Filed {suffix}", level.id)
        loose = await _upload(svc, f"Loose {suffix}", open_folder.id)
        documents += [filed, loose]
        assert plans.hidden_by is None

        archived = await svc.update_folder(plans.id, FolderUpdate(archived=True))
        assert archived.hidden_by == plans.id
        hidden_by = {f.id: f.hidden_by for f in await svc.list_folders()}
        assert hidden_by[plans.id] == plans.id
        assert hidden_by[level.id] == plans.id
        assert hidden_by[open_folder.id] is None

        # Upload, move or create a sub-folder: refused in the folder and below.
        for target in (plans.id, level.id):
            with pytest.raises(InvalidError, match="archived"):
                await _upload(svc, f"New {suffix}", target)
            with pytest.raises(InvalidError, match="archived"):
                await svc.update(loose.id, DocumentUpdate(folder_id=target))
            with pytest.raises(InvalidError, match="archived"):
                await svc.create_folder(
                    FolderCreate(name=f"Sub {suffix}", parent_id=target),
                    created_by="author",
                )
        assert await _names(svc, DocumentFilters(folder_id=level.id)) == {filed.name}
        assert (await svc.get(loose.id)).folder_id == open_folder.id

        # What is already there can still be saved in place, or moved out.
        kept = await svc.update(
            filed.id, DocumentUpdate(name=f"Kept {suffix}", folder_id=level.id)
        )
        assert kept.folder_id == level.id
        moved = await svc.update(filed.id, DocumentUpdate(folder_id=open_folder.id))
        assert moved.folder_id == open_folder.id

        # Restoring the folder opens it again.
        restored = await svc.update_folder(plans.id, FolderUpdate(archived=False))
        assert restored.hidden_by is None
        back = await svc.update(filed.id, DocumentUpdate(folder_id=level.id))
        assert back.folder_id == level.id
    finally:
        for document in documents:
            with contextlib.suppress(NotFoundError):
                await svc.delete(document.id)
        for folder in folders:
            with contextlib.suppress(NotFoundError, ConflictError):
                await svc.delete_folder(folder.id)
