# GRIDONE

_Gridone_ is an open-source Building Management System (BMS) for controlling building equipment (thermostats, chillers, boilers, and more), recording and querying their data, and automating workflows around them.

Gridone is built by [AGRID](https://a-grid.com/) and is under development 🏗️ (unstable).

## Objectives

- **Device extensibility** — new devices are added through YAML-based drivers, a registry of transport clients (HTTP, MQTT, BACnet, Modbus, KNX,...), and composable codecs that convert raw device values to typed data. No vendor-specific code lives in the source; all vendor detail lives in driver files.
- **API-first** — every feature is exposed through a robust, performant HTTP API, so the platform can support building applications for many use cases (and, longer term, an MCP controller and language-specific SDKs).
- **Easy to deploy** — a single Docker image runs the full stack.

## State of the art

Gridone is a monorepo. Python services live under `packages/`, and runnable applications live under `apps/`.

```
.
├── apps
│   ├── api_server     # FastAPI server exposing the HTTP API
│   ├── cli            # Standalone CLI for testing devices, drivers and transports
│   ├── migrations     # Database migration runner
│   └── ui             # React + TypeScript dashboard
├── packages
│   ├── api             # HTTP API package, wires the services together
│   ├── apps            # Application registration and management
│   ├── assets          # Hierarchical asset management (PostgreSQL ltree)
│   ├── automations     # Automations and trigger domain models
│   ├── commands        # Dispatch and lifecycle for device write operations
│   ├── dashboards      # Dashboard documents and widget registry for the UI
│   ├── devices_manager # Core domain logic for devices, drivers and transports
│   ├── models          # Shared models, errors and utilities
│   ├── notifications   # Notification dispatch and per-user delivery tracking
│   ├── timeseries      # Recording and querying device measurements
│   └── users           # User management and authentication
├── docker              # Production Docker image (nginx + FastAPI)
├── docs                # Documentation site sources (MkDocs)
├── sdk/ts              # TypeScript client for the API
├── pyproject.toml
└── uv.lock
```

## Quick start (Docker)

The Docker image bundles the built UI and the FastAPI backend behind nginx, and needs a PostgreSQL/TimescaleDB database to store its data. Create a `docker-compose.yml`:

```yaml
services:
  timescaledb:
    image: timescale/timescaledb:latest-pg18
    ports:
      - 5432:5432
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - timescaledb_data:/var/lib/postgresql/data

  gridone-app:
    image: ghcr.io/agrid-dev/gridone:latest
    ports:
      - 8765:8765
    environment:
      STORAGE_URL: postgresql://postgres:postgres@timescaledb:5432/postgres
      GRIDONE_TIMEZONE: Europe/Paris
    depends_on:
      - timescaledb

volumes:
  timescaledb_data:
```

Then start both services:

```sh
docker compose up
```

Open `http://localhost:8765`. A default `admin` / `admin` account is created automatically on first start.

See the [Getting Started guide](https://docs.gridone.a-grid.com/getting-started/developers/) for authentication and API usage, and [`docker/README.md`](docker/README.md) for building the image locally and production deployment topologies (host networking for building-LAN device discovery, HTTPS reverse proxy setup, etc).

## Documentation

Full documentation is available at [docs.gridone.a-grid.com](https://docs.gridone.a-grid.com).

## Contributing

Setting up a development environment, running tests, and the project's architecture are covered in [`CONTRIBUTING.md`](CONTRIBUTING.md).
