from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

import yaml
from pydantic import BaseModel

# Define a TypeVar bound to BaseModel
M = TypeVar("M", bound=BaseModel)


class YamlFileStorage[M]:
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
        self._root_path.mkdir(parents=True, exist_ok=True)
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

    def _get_file_path(self, name: str) -> Path:
        return self._root_path / (name + self._file_extension)

    def list_all(self) -> list[str]:
        return [file.stem for file in self._root_path.iterdir() if file.is_file()]

    def read(self, name: str) -> M:
        with self._get_file_path(name).open("r") as file:
            data = yaml.safe_load(file)
            return self._builder(data)

    def read_all(self) -> list[M]:
        return [self.read(name) for name in self.list_all()]

    def write(self, name: str, data: M) -> None:
        with self._get_file_path(name).open("w") as file:
            yaml.dump(data.model_dump(mode="json"), file)  # ty:ignore[unresolved-attribute]

    def delete(self, name: str) -> None:
        self._get_file_path(name).unlink()
