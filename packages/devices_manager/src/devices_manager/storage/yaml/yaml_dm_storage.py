import asyncio
from collections.abc import Callable
from pathlib import Path

import yaml
from pydantic import BaseModel

from devices_manager.storage.storage_backend import StorageBackend


class YamlFileStorage[M: BaseModel](StorageBackend[M]):
    """A basic generic file storage system for yaml data."""

    _root_path: Path
    _builder: Callable[[dict], M]
    _file_extension = ".yaml"

    def __init__(
        self,
        root_path: Path | str,
        model_cls: type[M] | None = None,
        factory: Callable[[dict], M] | None = None,
    ) -> None:
        self._root_path = Path(root_path)
        if factory is not None and model_cls is not None:
            msg = "Only one builder of model_cls or factory can be provided"
            raise ValueError(msg)
        if model_cls is not None:
            self._builder = model_cls.model_validate  # ty:ignore[unresolved-attribute]
        if factory is not None:
            self._builder = factory
        if not hasattr(self, "_builder") or not self._builder:
            msg = "Either model_cls or factory must be provided to build model"
            raise ValueError(msg)
        self._root_path.mkdir(parents=True, exist_ok=True)

    def _get_file_path(self, item_id: str) -> Path:
        return self._root_path / (item_id + self._file_extension)

    def _list_all_sync(self) -> list[str]:
        return [file.stem for file in self._root_path.iterdir() if file.is_file()]

    async def list_all(self) -> list[str]:
        return await asyncio.to_thread(self._list_all_sync)

    def _read_sync(self, item_id: str) -> M:
        with self._get_file_path(item_id).open("r", encoding="utf-8") as file:
            data = yaml.safe_load(file)
            return self._builder(data)

    async def read(self, item_id: str) -> M:
        return await asyncio.to_thread(self._read_sync, item_id)

    def _read_all_sync(self) -> list[M]:
        return [self._read_sync(item_id) for item_id in self._list_all_sync()]

    async def read_all(self) -> list[M]:
        return await asyncio.to_thread(self._read_all_sync)

    def _write_sync(self, item_id: str, data: M) -> None:
        with self._get_file_path(item_id).open("w", encoding="utf-8") as file:
            yaml.dump(data.model_dump(mode="json"), file)  # ty:ignore[unresolved-attribute]

    async def write(self, item_id: str, data: M) -> None:
        await asyncio.to_thread(self._write_sync, item_id, data)

    def _delete_sync(self, item_id: str) -> None:
        self._get_file_path(item_id).unlink()

    async def delete(self, item_id: str) -> None:
        await asyncio.to_thread(self._delete_sync, item_id)
