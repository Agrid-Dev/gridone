"""Shared service lifecycle for CLI commands."""

import contextlib
from collections.abc import AsyncIterator

from cli.config import get_storage_url
from devices_manager import DevicesService


@contextlib.asynccontextmanager
async def service(*, sync: bool = False) -> AsyncIterator[DevicesService]:
    """Yield a ready ``DevicesService`` and stop it on exit.

    ``sync=False`` (default) only loads data from storage — for one-off
    commands that read or write a single device. ``sync=True`` runs the full
    ``start()`` (background polling + persistence) for long-running commands
    like ``watch`` and ``discover``.
    """
    svc = DevicesService(get_storage_url())
    if sync:
        await svc.start()
    else:
        await svc.load()
    try:
        yield svc
    finally:
        await svc.stop()
