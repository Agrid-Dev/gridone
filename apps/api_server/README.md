# Gridone API server

A http server running the `gridone-api` package.

## Configuration

### Environment variables

`.env` example:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gridone
```

## Development

To run in development, add a `.env` file and run:

```sh
fastapi dev main.py
# or
uvicorn main:app --reload --reload-dir ../../packages/api # to reload when updating the api package

curl localhost:8000/devices/ | jq
```

## TimescaleDB quick start (Docker)

Run a local TimescaleDB container:

```sh
docker run --name gridone-timescaledb \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=gridone \
  -p 5432:5432 \
  -d timescale/timescaledb:latest-pg16
```

Then set:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gridone
```

The API lifespan initializes `devices_manager` Postgres schema on startup and closes the shared Postgres connection manager on shutdown.
