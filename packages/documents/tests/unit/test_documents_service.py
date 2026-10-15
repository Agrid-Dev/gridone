from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

from documents import (
    DocumentContent,
    DocumentCreate,
    DocumentFilters,
    DocumentsService,
    DocumentTooLargeError,
    DocumentUpdate,
    Folder,
    FolderCreate,
    FolderUpdate,
)
from documents.storage.protocol import DocumentsStorage
from models.errors import InvalidError, NotFoundError, StorageNotInitializedError
from models.pagination import Page

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def service(monkeypatch):
    storage = AsyncMock(spec=DocumentsStorage)
    # An unset AsyncMock iterates as empty and hides a missing folder read.
    storage.list_folders.return_value = []
    builder = AsyncMock(return_value=storage)
    monkeypatch.setattr("documents.service.build_storage", builder)
    svc = DocumentsService(None)
    await svc.start()
    yield svc, storage, builder
    await svc.stop()


async def test_lifecycle_is_idempotent(service):
    svc, storage, builder = service
    await svc.start()
    builder.assert_awaited_once_with(None)
    await svc.stop()
    await svc.stop()
    storage.close.assert_awaited_once()
    with pytest.raises(StorageNotInitializedError):
        await svc.get("x")


async def test_create_returns_saved_metadata_without_refetch(service):
    svc, storage, _ = service
    storage.create.side_effect = lambda document, _: document
    created = await svc.create(
        DocumentCreate(name="Notice"),
        filename="../été.txt",
        data=b"notice",
        created_by="author",
    )
    assert len(created.id) == 16
    assert created.filename == "été.txt"
    assert created.media_type == "text/plain"
    assert created.size == 6
    assert created.created_by == "author"
    assert created.created_at == created.updated_at
    storage.get.assert_not_awaited()


@pytest.mark.parametrize(
    ("filename", "data", "error"),
    [
        ("a.txt", b"", InvalidError),
        ("a.html", b"html", InvalidError),
        ("a.txt", b"123456", DocumentTooLargeError),
    ],
)
async def test_invalid_upload_never_writes(service, monkeypatch, filename, data, error):
    monkeypatch.setattr("documents.service.MAX_DOCUMENT_BYTES", 5)
    svc, storage, _ = service
    with pytest.raises(error):
        await svc.create(
            DocumentCreate(name="x"),
            filename=filename,
            data=data,
            created_by="a",
        )
    storage.create.assert_not_awaited()


async def test_exact_size_limit_is_accepted(service, monkeypatch):
    monkeypatch.setattr("documents.service.MAX_DOCUMENT_BYTES", 5)
    svc, storage, _ = service
    storage.create.side_effect = lambda document, _: document
    assert (
        await svc.create(
            DocumentCreate(name="x"),
            filename="a.txt",
            data=b"12345",
            created_by="a",
        )
    ).size == 5


@pytest.mark.parametrize("method", ["get", "get_content"])
async def test_missing_document_raises_not_found(service, method):
    svc, storage, _ = service
    getattr(storage, method).return_value = None
    with pytest.raises(NotFoundError, match="Document not found"):
        await getattr(svc, method)("missing")


async def test_reads_and_mutations_delegate_domain_values(service, document):
    svc, storage, _ = service
    storage.get.return_value = document
    storage.get_content.return_value = DocumentContent(document, b"notice")
    storage.list.return_value = Page(items=[document], total=1, page=1, size=50)
    storage.update.return_value = document
    assert await svc.get(document.id) == document
    assert (await svc.get_content(document.id)).data == b"notice"
    assert (await svc.list()).items == [document]
    assert await svc.update(document.id, DocumentUpdate(name="renamed")) == document
    await svc.delete(document.id)
    storage.delete.assert_awaited_once_with(document.id)


def _folder(folder_id, parent_id=None, *, archived=False) -> Folder:
    now = datetime.now(UTC)
    return Folder(
        id=folder_id,
        name=folder_id,
        parent_id=parent_id,
        archived_at=now if archived else None,
        created_by="author",
        created_at=now,
        updated_at=now,
    )


async def test_lists_spanning_folders_leave_out_archived_subtrees(service):
    svc, storage, _ = service
    storage.list_folders.return_value = [
        _folder("plans", archived=True),
        _folder("level", "plans"),
        _folder("notices"),
    ]
    await svc.list(filters=DocumentFilters(q="boiler"))
    assert storage.list.await_args.kwargs["hidden_folder_ids"] == {"plans", "level"}


@pytest.mark.parametrize(
    "filters",
    [
        DocumentFilters(folder_id="level"),
        DocumentFilters(top_level=True),
        DocumentFilters(archived=True),
    ],
)
async def test_browsing_and_archives_list_documents_wherever_filed(service, filters):
    svc, storage, _ = service
    storage.list_folders.return_value = [_folder("plans", archived=True)]
    await svc.list(filters=filters)
    storage.list_folders.assert_not_awaited()
    assert storage.list.await_args.kwargs["hidden_folder_ids"] == frozenset()


async def test_folder_mutations_delegate_with_new_ids_and_timestamps(service):
    svc, storage, _ = service
    storage.create_folder.side_effect = lambda folder: folder
    created = await svc.create_folder(
        FolderCreate(name="Plans", parent_id="root"), created_by="author"
    )
    assert len(created.id) == 16
    assert created.parent_id == "root"
    assert created.created_by == "author"
    assert created.created_at == created.updated_at
    assert created.archived_at is None
    patch = FolderUpdate(archived=True)
    stored = _folder("level", "plans")
    storage.update_folder.return_value = stored
    storage.list_folders.return_value = [_folder("plans", archived=True), stored]
    updated = await svc.update_folder(stored.id, patch)
    assert storage.update_folder.await_args.args[:2] == (stored.id, patch)
    assert updated.hidden_by == "plans"
    assert stored.hidden_by is None
    await svc.delete_folder(created.id)
    storage.delete_folder.assert_awaited_once_with(created.id)
    storage.list_folders.return_value = []
    assert await svc.list_folders() == []


async def test_list_folders_says_which_archived_folder_hides_each(service):
    svc, storage, _ = service
    storage.list_folders.return_value = [
        _folder("plans", archived=True),
        _folder("level", "plans"),
        _folder("notices"),
    ]
    hidden_by = {f.id: f.hidden_by for f in await svc.list_folders()}
    assert hidden_by == {"plans": "plans", "level": "plans", "notices": None}


async def test_nothing_is_filed_in_a_hidden_folder(service, document):
    svc, storage, _ = service
    storage.list_folders.return_value = [
        _folder("plans", archived=True),
        _folder("level", "plans"),
    ]
    with pytest.raises(InvalidError, match="archived"):
        await svc.create(
            DocumentCreate(name="Notice", folder_id="level"),
            filename="notice.txt",
            data=b"notice",
            created_by="author",
        )
    with pytest.raises(InvalidError, match="archived"):
        await svc.create_folder(
            FolderCreate(name="Sub", parent_id="plans"), created_by="author"
        )
    storage.get.return_value = document
    with pytest.raises(InvalidError, match="archived"):
        await svc.update("doc", DocumentUpdate(folder_id="level"))
    storage.create.assert_not_awaited()
    storage.create_folder.assert_not_awaited()
    storage.update.assert_not_awaited()


async def test_a_document_in_a_hidden_folder_can_be_saved_in_place(service, document):
    svc, storage, _ = service
    storage.list_folders.return_value = [_folder("plans", archived=True)]
    storage.get.return_value = document.model_copy(update={"folder_id": "plans"})
    patch = DocumentUpdate(name="Renamed", folder_id="plans")
    await svc.update("doc", patch)
    storage.update.assert_awaited_once()
    # A patch that leaves the folder alone never reads the document first.
    storage.get.reset_mock()
    await svc.update("doc", DocumentUpdate(name="Again"))
    await svc.update("doc", DocumentUpdate(folder_id=None))
    storage.get.assert_not_awaited()
