# Gridone Devices Manager

`gridone-devices-manager` contains the core domain logic for managing building devices, drivers, and transports.

## Architecture

```mermaid
graph TD
    subgraph Facade
        DM[DevicesManager]
    end

    subgraph Registries
        DR[DeviceRegistry]
        TrR[TransportRegistry]
        DrvR[DriverRegistry]
    end

    subgraph "Device hierarchy"
        D[Device]
        PD[PhysicalDevice]
        VD[VirtualDevice]
    end

    subgraph Core
        Drv[Driver]
        TC[TransportClient]
    end

    subgraph Storage
        SB[StorageBackend]
        YAML[YAML Backend]
        PG[Postgres Backend]
    end

    DM --> DR
    DM --> TrR
    DM --> DrvR
    DM -->|"start_sync / stop_sync"| D

    DR --> D
    DR --> DrvR
    DR --> TrR

    D --> PD
    D --> VD

    PD -->|"uses"| Drv
    PD -->|"uses"| TC
    PD -->|"start_sync: init_listeners + poll loop"| PD

    SB --> YAML
    SB --> PG
    DM -->|"persists via"| SB
```

### Key design decisions

- **Device owns its sync lifecycle.** Each device implements `start_sync()` / `stop_sync()`. Physical devices start transport listeners and spawn their own poll task. Virtual devices are no-ops. The facade just calls these methods — no centralized polling manager.
- **Registries are pure in-memory.** `DeviceRegistry`, `TransportRegistry`, and `DriverRegistry` handle CRUD on in-memory dicts. Persistence is the facade's responsibility.
- **Facade = orchestration recipes.** `DevicesManager` methods are short sequences: delegate to registry, toggle sync, persist. No business logic lives in the facade.
- **Protocol-based DI.** `DeviceRegistryInterface` allows the facade to be tested with mocked registries.

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

- YAML backend for local development:
  `storage/yaml/`
- PostgreSQL backend for production (including TimescaleDB):
  `storage/postgres/`

Both backends implement the same abstraction, so application logic does not change.

### Factory pattern

`storage/factory.py` provides:

- `async build_storage(url: str) -> DevicesManagerStorage`

Resolution rules:

- `postgresql://...` or `postgres://...` -> PostgreSQL backend
- Any other value -> YAML backend path

## Clean architecture boundary

`DevicesManager` is storage-agnostic: it only depends on `DevicesManagerStorage`, never on concrete backend classes.

```python
dm = await DevicesManager.from_storage("postgresql://user:pass@host/db")
# or
dm = await DevicesManager.from_storage("/path/to/yaml/dir")
```
