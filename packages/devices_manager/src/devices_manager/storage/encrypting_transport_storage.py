from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.storage.storage_backend import StorageBackend

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.transports.secret_cipher import SecretCipher
    from devices_manager.dto import Transport


def _transform_secrets(
    transport: Transport, transform: Callable[[str], str]
) -> Transport:
    updates = {
        name: transform(value)
        for name in transport.config.secret_field_names()
        if (value := getattr(transport.config, name)) is not None
    }
    if not updates:
        return transport
    new_config = transport.config.model_copy(update=updates)
    return transport.model_copy(update={"config": new_config})


class EncryptingTransportStorage(StorageBackend["Transport"]):
    """Wraps a transport storage backend, encrypting secret config fields at rest."""

    def __init__(
        self, backend: StorageBackend[Transport], cipher: SecretCipher
    ) -> None:
        self._backend = backend
        self._cipher = cipher

    async def read(self, item_id: str) -> Transport:
        transport = await self._backend.read(item_id)
        return _transform_secrets(transport, self._cipher.decrypt)

    async def write(self, item_id: str, data: Transport) -> None:
        encrypted = _transform_secrets(data, self._cipher.encrypt)
        await self._backend.write(item_id, encrypted)

    async def read_all(self) -> list[Transport]:
        transports = await self._backend.read_all()
        return [_transform_secrets(t, self._cipher.decrypt) for t in transports]

    async def list_all(self) -> list[str]:
        return await self._backend.list_all()

    async def delete(self, item_id: str) -> None:
        await self._backend.delete(item_id)
