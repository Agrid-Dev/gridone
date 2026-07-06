# Gridone Devices Manager

`gridone-devices-manager` contains the core domain logic for managing building devices, drivers, and transports.

## Architecture

```mermaid
graph TD
    subgraph Facade
        DM[DevicesService]
    end

    subgraph Registries
        DR[DeviceRegistry]
        TrR[TransportRegistry]
        DrvR[DriverRegistry]
    end

    subgraph Devices
        D[CoreDevice]
    end

    subgraph Core
        Drv[Driver]
        TC[TransportClient]
    end

    subgraph Storage
        SB[StorageBackend]
        MEM[Memory Backend]
        PG[Postgres Backend]
    end

    DM --> DR
    DM --> TrR
    DM --> DrvR
    DM -->|"start / stop"| D

    DR --> D
    DR -.->|"resolve_driver(id)"| Drv
    DR -.->|"resolve_transport(id)"| TC

    DrvR --> Drv
    TrR --> TC

    D -->|"uses"| Drv
    D -->|"uses"| TC
    D -->|"start_sync: init_listeners + poll loop"| D

    SB --> MEM
    SB --> PG
    DM -->|"persists via"| SB
```

### Key design decisions

- **Device owns its sync lifecycle.** Each device implements `start_sync()` / `stop_sync()`: it starts transport listeners and spawns its own poll task. The service drives these via `start()` / `stop()` — no centralized polling manager.
- **Registries are pure in-memory.** `DeviceRegistry`, `TransportRegistry`, and `DriverRegistry` handle CRUD on in-memory dicts. Persistence is the service's responsibility.
- **Service = orchestration recipes.** `DevicesService` methods are short sequences: delegate to registry, toggle sync, persist. No business logic lives in the service.
- **Dependency inversion via resolvers.** `DeviceRegistry` doesn't depend on `DriverRegistry` or `TransportRegistry` — it receives `resolve_driver` / `resolve_transport` callables, injected by the service. `DeviceRegistryInterface` allows the service itself to be tested with mocks.

## Storage architecture

### Abstractions

Storage is defined by two async protocols in `storage/storage_backend.py`:

- `StorageBackend[M]`
- `DevicesManagerStorage`

`DevicesManagerStorage` composes three typed backends:

- `devices: StorageBackend[DeviceDTO]`
- `drivers: StorageBackend[DriverDTO]`
- `transports: StorageBackend[TransportDTO]`

All methods are async (`read`, `write`, `read_all`, `list_all`, `delete`).

### Backends

- In-memory backend for tests and ephemeral runs: `storage/memory.py`
- PostgreSQL backend for production (including TimescaleDB): `storage/postgres/`

Both backends implement the same abstraction, so application logic does not change.

### Factory

`storage/factory.py` provides:

- `async build_storage(url: str | None) -> DevicesManagerStorage`

Resolution rules:

- `None` -> in-memory backend
- `postgresql://...` -> PostgreSQL backend
- Any other URL -> raises `UnsupportedStorageError`

## Service shape

`DevicesService` follows the common service shape (`__init__(storage_url, ...)` + `async start` / `async stop`):

```python
from devices_manager import DevicesService

# In-memory (tests, ephemeral runs)
svc = DevicesService()
await svc.start()
...
await svc.stop()

# PostgreSQL
svc = DevicesService("postgresql://user:pass@host/db")
await svc.start()
...
await svc.stop()
```
