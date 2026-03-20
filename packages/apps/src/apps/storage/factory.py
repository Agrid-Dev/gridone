from apps.storage.storage_backend import (
    AppStorageBackend,
    RegistrationRequestStorageBackend,
)

POSTGRES_PREFIX = "postgresql"


async def build_apps_storages(
    url: str,
) -> tuple[RegistrationRequestStorageBackend, AppStorageBackend]:
    """Build both storage backends from a connection URL."""
    if url.startswith(POSTGRES_PREFIX):
        from apps.storage.postgres import build  # noqa: PLC0415

        return await build(url)

    msg = "Apps package requires PostgreSQL storage"
    raise ValueError(msg)


__all__ = ["build_apps_storages"]
