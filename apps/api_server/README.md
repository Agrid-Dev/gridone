# Gridone API server

A http server running the `gridone-api` package.

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
