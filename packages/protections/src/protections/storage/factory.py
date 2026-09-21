from models.errors import StorageConnectionError, UnsupportedStorageError

from .memory import MemoryStorage
from .protocol import ProtectionsStorage


async def build_storage(url: str | None) -> ProtectionsStorage:
    if url is None:
        return MemoryStorage()
    try:
        if url.startswith("postgresql://"):
            from .postgres import build_postgres_storage  # noqa: PLC0415

            return await build_postgres_storage(url)
        if url.startswith("yaml:"):
            from .yaml import YamlStorage  # noqa: PLC0415

            return YamlStorage(url.removeprefix("yaml:"))
    except Exception as exc:
        msg = "Failed to initialize protections storage"
        raise StorageConnectionError(msg) from exc
    msg = "Unsupported protections storage URL scheme"
    raise UnsupportedStorageError(msg)
