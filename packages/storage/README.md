# gridone-storage

Shared storage infrastructure for Gridone services.

This package centralizes reusable storage primitives used by service packages such as:

- `devices_manager`
- future metrics/time-series services
- dashboards
- alerts
- automations
- users
- app manager

## Exports

`gridone_storage` exports:

- `StorageBackend[M]`: generic storage backend protocol.
- `PostgresConnectionManager`: asyncpg pool manager.
- `PostgresStorageBackend[M]`: reusable JSONB CRUD base for Postgres tables.
- `SchemaManager` / `BaseSchemaManager`: schema initialization pattern.
- `StorageError` / `NotFoundError`: shared storage exceptions.

## Usage examples

### Connection manager

```python
from gridone_storage import PostgresConnectionManager

manager = PostgresConnectionManager("postgresql://user:pass@localhost:5432/gridone")
```

Or reuse an existing `asyncpg.Pool`:

```python
import asyncpg

from gridone_storage import PostgresConnectionManager

pool = await asyncpg.create_pool(dsn="postgresql://user:pass@localhost:5432/gridone")
manager = PostgresConnectionManager(pool)
```

### Implement a Postgres storage backend

```python
from pydantic import BaseModel

from gridone_storage import PostgresConnectionManager, PostgresStorageBackend


class Widget(BaseModel):
    name: str
    value: int


class WidgetStorage(PostgresStorageBackend[Widget]):
    def serialize(self, data: Widget) -> object:
        return data.model_dump(mode="json")

    def deserialize(self, data: object, *, item_id: str) -> Widget:
        del item_id
        return Widget.model_validate(data)


manager = PostgresConnectionManager("postgresql://user:pass@localhost:5432/gridone")
storage = WidgetStorage(connection_manager=manager, table_name="widgets")
```

### Schema manager

```python
from collections.abc import Sequence

from gridone_storage import BaseSchemaManager, PostgresConnectionManager


class WidgetSchemaManager(BaseSchemaManager):
    @property
    def schema_statements(self) -> Sequence[str]:
        return (
            """
            CREATE TABLE IF NOT EXISTS widgets (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL
            )
            """,
        )


schema_manager = WidgetSchemaManager(PostgresConnectionManager("postgresql://..."))
await schema_manager.ensure_schema()
```
