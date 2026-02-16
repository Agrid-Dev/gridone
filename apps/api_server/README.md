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

The FastAPI lifespan only calls `DevicesManager.from_storage(url)`; backend selection is handled by the storage factory.

## Run

```sh
fastapi dev main.py
# or
uvicorn main:app --reload --reload-dir ../../packages/api # to reload when updating the api package

curl localhost:8000/devices/ | jq
```
