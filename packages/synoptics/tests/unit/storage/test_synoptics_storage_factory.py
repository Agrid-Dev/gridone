"""Which backend a URL selects, and how a bad one fails."""

import pytest

from models.errors import StorageConnectionError, UnsupportedStorageError
from synoptics.storage import MemoryStorage, build_storage

pytestmark = pytest.mark.asyncio


async def test_no_url_selects_the_memory_backend():
    assert isinstance(await build_storage(None), MemoryStorage)


@pytest.mark.parametrize("url", ["mysql://host/db", "/var/lib/plates", "redis://host"])
async def test_an_unknown_scheme_is_unsupported(url):
    with pytest.raises(UnsupportedStorageError, match="Unsupported synoptics"):
        await build_storage(url)


async def test_an_unreachable_postgres_is_a_connection_error():
    with pytest.raises(StorageConnectionError, match="Failed to initialize"):
        await build_storage("postgresql://user:pw@127.0.0.1:1/nope")
