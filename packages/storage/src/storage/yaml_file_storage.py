from pathlib import Path
from typing import TypeVar

import yaml

T = TypeVar("T", bound=dict)


class YamlFileStorage[T]:
    """A basic generic file storage system for yaml data."""

    _root_path: Path
    _file_extension = ".yaml"

    def __init__(self, root_path: Path | str) -> None:
        self._root_path = Path(root_path)
        self._root_path.mkdir(parents=True, exist_ok=True)

    def _get_file_path(self, name: str) -> Path:
        return self._root_path / (name + self._file_extension)

    def list_all(self) -> list[str]:
        return [file.stem for file in self._root_path.iterdir() if file.is_file()]

    def read(self, name: str) -> T:
        with self._get_file_path(name).open("r") as file:
            return yaml.safe_load(file)

    def read_all(self) -> list[T]:
        return [self.read(name) for name in self.list_all()]

    def write(self, name: str, data: T) -> None:
        with self._get_file_path(name).open("w") as file:
            yaml.dump(data, file)

    def delete(self, name: str) -> None:
        self._get_file_path(name).unlink()
