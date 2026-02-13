# gridone-devices-manager

`gridone-devices-manager` is the service package that manages:

- devices
- drivers
- transports

## Storage architecture

The package exposes `devices_manager.storage/` with a Postgres backend implementation:

- `PostgresDevicesManagerStorage`: Postgres/TimescaleDB backend.

Both follow a protocol-based design:

- `StorageBackend[M]` (from `gridone-storage`) defines generic CRUD operations.
- `DevicesManagerStorage` (service protocol) composes three sub-storages:
  - `devices: StorageBackend[DeviceDTO]`
  - `drivers: StorageBackend[DriverDTO]`
  - `transports: StorageBackend[TransportDTO]`

This keeps `DevicesManager` decoupled from storage implementation details.

## Instantiation examples

### Postgres backend (connection string)

```python
import asyncio

from devices_manager import DevicesManager

dm = asyncio.run(
    DevicesManager.from_postgres("postgresql://user:pass@localhost:5432/gridone")
)
```

### Postgres backend (shared connection manager)

```python
import asyncio

from devices_manager import DevicesManager
from gridone_storage import PostgresConnectionManager

connection_manager = PostgresConnectionManager(
    "postgresql://user:pass@localhost:5432/gridone"
)
dm = asyncio.run(DevicesManager.from_postgres(connection_manager))
```

`from_postgres(...)` ensures the required `devices_manager` schema/tables exist before loading data.
