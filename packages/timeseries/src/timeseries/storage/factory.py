from __future__ import annotations

from timeseries.storage.memory import MemoryStorage


def build_storage(url: str | None = None) -> MemoryStorage:
    if url is None:
        return MemoryStorage()
    msg = f"Unsupported storage URL scheme: {url}"
    raise ValueError(msg)
