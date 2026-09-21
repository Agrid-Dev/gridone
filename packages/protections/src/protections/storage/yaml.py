"""Atomic revision ledger alongside the CLI's YAML device store."""

import os
import tempfile
from pathlib import Path

from pydantic import TypeAdapter

from models.protections import Protection

from .memory import MemoryStorage


class YamlStorage(MemoryStorage):
    def __init__(self, root: str) -> None:
        super().__init__()
        self._path = Path(root) / "protections.json"
        self._path.parent.mkdir(parents=True, exist_ok=True)
        if self._path.exists():
            self._revisions = TypeAdapter(dict[str, list[Protection]]).validate_json(
                self._path.read_text()
            )

    async def save(self, protection: Protection) -> Protection:
        """Publish a complete ledger atomically, rolling back memory on failure."""
        previous = {key: list(rows) for key, rows in self._revisions.items()}
        saved = await super().save(protection)
        temporary: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                dir=self._path.parent, delete=False
            ) as stream:
                temporary = stream.name
                stream.write(
                    TypeAdapter(dict[str, list[Protection]]).dump_json(self._revisions)
                )
                stream.flush()
                os.fsync(stream.fileno())
            self._replace(temporary)
        except BaseException:
            self._revisions = previous
            if temporary is not None:
                self._remove(temporary)
            raise
        return saved

    def _replace(self, temporary: str) -> None:
        Path(temporary).replace(self._path)

    @staticmethod
    def _remove(temporary: str) -> None:
        Path(temporary).unlink(missing_ok=True)
