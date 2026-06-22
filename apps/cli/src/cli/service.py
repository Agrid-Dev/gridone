"""Shared service lifecycle for CLI commands."""

import asyncio
import contextlib
import functools
from collections.abc import AsyncIterator, Callable, Coroutine
from typing import Any

from cli.config import get_storage_url
from devices_manager import DevicesService


@contextlib.asynccontextmanager
async def service() -> AsyncIterator[DevicesService]:
    """Yield a loaded ``DevicesService`` and stop it on exit.

    Only loads data from storage — no background polling or persistence — so
    CLI commands never start the full service or write to the DB on their own.
    """
    svc = DevicesService(get_storage_url())
    await svc.load()
    try:
        yield svc
    finally:
        await svc.stop()


def run_async[**P](fn: Callable[P, Coroutine[Any, Any, None]]) -> Callable[P, None]:
    """Adapt an async command body into the sync callable Typer expects."""

    @functools.wraps(fn)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> None:
        asyncio.run(fn(*args, **kwargs))

    return wrapper
