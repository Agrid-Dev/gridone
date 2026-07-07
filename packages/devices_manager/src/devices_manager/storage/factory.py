from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from devices_manager.core.transports.secret_cipher import SecretCipher
from models.errors import StorageConnectionError, UnsupportedStorageError

from .encrypting_transport_storage import EncryptingTransportStorage
from .memory import MemoryDevicesStorage
from .yaml import CoreFileStorage

if TYPE_CHECKING:
    from .storage_backend import DevicesManagerStorage

_POSTGRES_PREFIX = "postgresql"
_YAML_PREFIX = "yaml:"

logger = logging.getLogger(__name__)


async def _build_raw_storage(url: str | None) -> DevicesManagerStorage:
    if url is None:
        return MemoryDevicesStorage()

    if url.startswith(_YAML_PREFIX):
        root_dir = url[len(_YAML_PREFIX) :]
        try:
            return CoreFileStorage(root_dir)
        except OSError as exc:
            msg = "Failed to initialize devices_manager yaml backend"
            raise StorageConnectionError(msg) from exc

    if url.startswith(_POSTGRES_PREFIX):
        import json  # noqa: PLC0415

        import asyncpg  # noqa: PLC0415

        from .postgres import (  # noqa: PLC0415
            PostgresDevicesManagerStorage,
            run_migrations,
        )

        async def _init_connection(conn: asyncpg.Connection) -> None:
            await conn.set_type_codec(
                "jsonb",
                encoder=json.dumps,
                decoder=json.loads,
                schema="pg_catalog",
            )

        try:
            run_migrations(url)
            pool = await asyncpg.create_pool(
                dsn=url, min_size=1, max_size=3, init=_init_connection
            )
        except Exception as exc:
            msg = "Failed to initialize devices_manager postgres backend"
            raise StorageConnectionError(msg) from exc
        return PostgresDevicesManagerStorage(pool)

    msg = f"Unsupported devices_manager storage URL scheme: {url!r}"
    raise UnsupportedStorageError(msg)


async def build_storage(
    url: str | None = None,
    *,
    transport_encryption_key: str | None = None,
) -> DevicesManagerStorage:
    """Build a devices_manager storage backend from a connection URL.

    ``url=None`` selects the in-memory backend. A ``postgresql://`` URL
    builds the postgres backend, applying yoyo migrations and opening an
    asyncpg pool. A ``yaml:path/to/db`` URL builds the yaml file backend
    rooted at ``path/to/db``.

    ``storage.transports`` always encrypts secret config fields at rest.
    Without ``transport_encryption_key``, an ephemeral key is generated for
    this process only — secrets encrypted under it become undecryptable
    after a restart, so production deployments must set it explicitly.

    Raises:
        UnsupportedStorageError: the URL scheme is not recognised.
        StorageConnectionError: the postgres or yaml backend cannot be
            reached or initialized (migration failure, connection refused,
            unwritable path, ...).
    """
    storage = await _build_raw_storage(url)
    if transport_encryption_key is None:
        logger.warning(
            "TRANSPORT_ENCRYPTION_KEY not configured: using an ephemeral "
            "per-process key. Transport secrets will not be decryptable "
            "after a restart. Set TRANSPORT_ENCRYPTION_KEY explicitly for "
            "any deployment expected to persist across restarts."
        )
    cipher = SecretCipher(transport_encryption_key or SecretCipher.generate_key())
    storage.transports = EncryptingTransportStorage(storage.transports, cipher)
    return storage


__all__ = ["build_storage"]
