# Gridone API server

A http server running the `gridone-api` package.

## Configuration

### Timezone

| Variable | Format | Default | Example |
|---|---|---|---|
| `GRIDONE_TIMEZONE` | IANA timezone name | `UTC` | `Europe/Paris` |

Set in `.env` or as an environment variable. Validated at startup — an unknown timezone name causes an immediate startup failure with a clear error message. One instance corresponds to one building, so timezone is an instance-level setting and does not change at runtime.

### Tracing (OpenTelemetry)

The API can emit distributed traces via [OpenTelemetry](https://opentelemetry.io/). Tracing is **opt-in and disabled by default** — when it is off the OpenTelemetry SDK is never imported, so there is no runtime or behavioural cost.

Enable it by pointing the API at an OTLP collector:

| Variable | Format | Default | Example |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP base URL | _(unset → disabled)_ | `http://localhost:4318` |
| `OTEL_SERVICE_NAME` | string | `gridone-api` | `gridone-api` |

Setting `OTEL_EXPORTER_OTLP_ENDPOINT` turns tracing on. Spans are exported over **OTLP HTTP/protobuf** (default port `4318`) to a local [Grafana Alloy](https://grafana.com/docs/alloy/) agent, which forwards them to Grafana Cloud (Tempo). Two instrumentations are installed when enabled:

- **FastAPI** — one server span per HTTP request.
- **HTTPX** — client spans for outbound calls (e.g. HTTP-based device transports), nested under the request span.

All other behaviour (sampling, headers, extra resource attributes, ...) is controlled through the standard [`OTEL_*` environment variables](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/). `service.version` is populated automatically from `GRIDONE_VERSION`.

```env
# Enable tracing to a local Alloy agent
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

In Docker, pass the variable through to the container (e.g. `docker run -e OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318 ...`); supervisord forwards its environment to the uvicorn process.

## Development

Configure storage with a single URL-like setting in `.env`:

- Recommended: `STORAGE_URL`
- Compatibility fallback: `DATABASE_URL`, then `DB_PATH`

### Local development (YAML backend)

Any filesystem path uses the YAML backend:

```env
STORAGE_URL=.db
# or
STORAGE_URL=/tmp/gridone-db
```

### Production / TimescaleDB (PostgreSQL backend)

TimescaleDB uses PostgreSQL connection URLs.

Quick-start with Docker:

```sh
docker run --name gridone-timescaledb \
  -e POSTGRES_DB=gridone \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d timescale/timescaledb:latest-pg16
```

Then set:

```env
STORAGE_URL=postgresql://postgres:postgres@localhost:5432/gridone
```

## Migrations

Schema migrations are managed by [yoyo-migrations](https://ollycope.com/software/yoyo/latest/). Each package (`users`, `devices_manager`, `timeseries`, `assets`) owns its migrations under `packages/<pkg>/src/<pkg>/storage/postgres/migrations/`.

### Automatic

Migrations run automatically in two places:

- **App startup** — the FastAPI lifespan calls `run_migrations()` per package before building storage instances (PostgreSQL only; skipped for the YAML backend).
- **Docker** — `python -m migrations apply` runs before supervisord in the container `CMD`.

### Manual CLI

```sh
# Apply all pending migrations (reads STORAGE_URL / DATABASE_URL from env)
python -m migrations apply

# Or pass the URL explicitly
python -m migrations apply --database-url postgresql://postgres:postgres@localhost:5432/gridone
```

### Adding a new migration

1. Create a new `.sql` file in the relevant package's migrations directory:

   ```
   packages/<pkg>/src/<pkg>/storage/postgres/migrations/NNNN.<pkg>-<description>.sql
   ```

2. Add a `-- depends:` header referencing the previous migration in the same package:

   ```sql
   -- depends: 0001.<pkg>-initial

   ALTER TABLE ...;
   ```

3. Optionally create a rollback companion file with the same name plus `.rollback.sql`.

4. Naming rules:
   - Prefix filenames with the package name (e.g. `0002.users-...`) to avoid collisions in yoyo's shared tracking table.
   - `-- depends:` declarations must stay **intra-package** only — no cross-package dependencies.

### Rollback

```sh
# Undo the latest migration for a specific package
yoyo rollback --database postgresql://... packages/<pkg>/src/<pkg>/storage/postgres/migrations/
```

## Run

```sh
fastapi dev main.py
# or
uvicorn main:app --reload --reload-dir ../../packages/api # to reload when updating the api package

curl localhost:8000/devices/ | jq
```
