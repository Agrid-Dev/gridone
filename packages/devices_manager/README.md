# Gridone Devices Manager

`gridone-devices-manager` contains the core domain logic for:

- devices
- drivers
- transports

It also defines a storage abstraction and multiple storage backends.

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

## Folder structure

```text
storage/
├── __init__.py
├── storage_backend.py
├── factory.py
├── yaml/
│   ├── __init__.py
│   ├── yaml_dm_storage.py
│   └── core_file_storage.py
└── postgres/
    ├── __init__.py
    ├── postgres_storage.py
    └── postgres_dm_storage.py
```

## Clean architecture boundary

`DevicesManager` is storage-agnostic: it only depends on `DevicesManagerStorage`, never on concrete backend classes.

Typical initialization:

```python
dm = await DevicesManager.from_storage("postgresql://user:pass@host/db")
# or
dm = await DevicesManager.from_storage("/path/to/yaml/dir")
```
