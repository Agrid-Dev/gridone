from documents.storage.memory import MemoryStorage
from documents.storage.protocol import DocumentsStorage
from models.errors import StorageConnectionError, UnsupportedStorageError


async def build_storage(url: str | None) -> DocumentsStorage:
    if url is None:
        return MemoryStorage()
    if url.startswith(("postgresql://", "postgresql+")):
        from documents.storage.postgres import build_postgres_storage  # noqa: PLC0415

        try:
            return await build_postgres_storage(url)
        except Exception as exc:
            msg = "Failed to initialize documents storage."
            raise StorageConnectionError(msg) from exc
    msg = "Unsupported documents storage URL scheme."
    raise UnsupportedStorageError(msg)
