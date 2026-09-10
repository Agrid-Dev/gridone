"""Durable file replacement and process locks shared by YAML storage."""

import fcntl
import os
import sys
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from pathlib import Path


def sync(fd: int) -> None:
    """Flush data and directory entries, including the drive cache on Darwin."""
    os.fsync(fd)
    if sys.platform == "darwin":
        with suppress(OSError):
            fcntl.fcntl(fd, fcntl.F_FULLFSYNC)


def sync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY)
    try:
        sync(fd)
    finally:
        os.close(fd)


def atomic_write(path: Path, data: bytes) -> None:
    """Write and flush a temporary sibling before replacing the visible file."""
    fd, temporary = tempfile.mkstemp(prefix=".tmp-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            sync(stream.fileno())
        Path(temporary).replace(path)
        sync_directory(path.parent)
    finally:
        Path(temporary).unlink(missing_ok=True)


@contextmanager
def file_lock(path: Path) -> Iterator[None]:
    with path.open("a+b") as stream:
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
