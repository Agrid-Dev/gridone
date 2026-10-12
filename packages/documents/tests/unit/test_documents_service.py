from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

from documents import (
    DocumentAccess,
    DocumentContent,
    DocumentCreate,
    DocumentsService,
    DocumentTooLargeError,
    DocumentUpdate,
)
from documents.storage.protocol import DocumentsStorage
from models.errors import InvalidError, NotFoundError, StorageNotInitializedError
from models.pagination import Page

pytestmark = pytest.mark.asyncio
ADMIN = DocumentAccess("admin", is_admin=True)


@pytest_asyncio.fixture
async def service(monkeypatch):
    storage = AsyncMock(spec=DocumentsStorage)
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
        await svc.get("x", ADMIN)


async def test_create_returns_saved_metadata_without_refetch(service):
    svc, storage, _ = service
    storage.create.side_effect = lambda document, _: document
    created = await svc.create(
        DocumentCreate(name="Notice", allowed_role_ids=[]),
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
            DocumentCreate(name="x", allowed_role_ids=[]),
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
            DocumentCreate(name="x", allowed_role_ids=[]),
            filename="a.txt",
            data=b"12345",
            created_by="a",
        )
    ).size == 5


@pytest.mark.parametrize("method", ["get", "get_content"])
async def test_missing_and_hidden_have_the_same_error(service, method):
    svc, storage, _ = service
    getattr(storage, method).return_value = None
    with pytest.raises(NotFoundError, match="Document not found"):
        await getattr(svc, method)("missing", ADMIN)


async def test_reads_and_mutations_delegate_domain_values(service, document):
    svc, storage, _ = service
    storage.get.return_value = document
    storage.get_content.return_value = DocumentContent(document, b"notice")
    storage.list.return_value = Page(items=[document], total=1, page=1, size=50)
    storage.update.return_value = document
    storage.has_role_reference.return_value = True
    assert await svc.get(document.id, ADMIN) == document
    assert (await svc.get_content(document.id, ADMIN)).data == b"notice"
    assert (await svc.list(ADMIN)).items == [document]
    assert await svc.update(document.id, DocumentUpdate(name="renamed")) == document
    assert await svc.has_role_reference("viewer")
    await svc.delete(document.id)
    storage.delete.assert_awaited_once_with(document.id)
