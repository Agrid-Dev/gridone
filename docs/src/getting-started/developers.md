# Getting Started — Developers

This guide takes you from the complete setup to a first authenticated API request against
a running Gridone stack.

## Before you begin

You'll need:

- **Docker** — to run TimescaleDB and optionally the full production container
- [**uv**](https://docs.astral.sh/uv/) — to install dependencies and run the dev server

Clone the repo and install all workspace packages:

```sh
git clone https://github.com/Agrid-Dev/gridone
cd gridone
uv sync --all-packages
```

---

## 1. Start TimescaleDB

Gridone requires PostgreSQL with the TimescaleDB extension. Start it with Docker:

```sh
docker run --name gridone-timescaledb \
  -e POSTGRES_DB=gridone \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d timescale/timescaledb:latest-pg16
```

---

## 2. Configure the environment

Create `apps/api_server/.env`:

```env
STORAGE_URL=postgresql://postgres:postgres@localhost:5432/gridone
GRIDONE_TIMEZONE=Europe/Paris
```

Replace `Europe/Paris` with your building's IANA timezone name (e.g. `America/New_York`,
`Asia/Tokyo`). `GRIDONE_TIMEZONE` defaults to `UTC` if unset — the server will refuse
to start with a clear error if the value is not a valid IANA timezone name.

---

## 3. Start the server

### Development mode

Run from `apps/api_server/`:

```sh
cd apps/api_server
fastapi dev main.py
```

The API is available at **`http://localhost:8000`**. Schema migrations run
automatically at startup.

### Production container

`docker/Dockerfile` builds a self-contained image: the React UI, the API server
(uvicorn), and an nginx reverse proxy — all managed by supervisord, exposed on port
`8765`. The API is accessible under the `/api/` prefix.

Build from the repo root:

```sh
docker build -f docker/Dockerfile -t gridone .
```

Run the container, passing `STORAGE_URL` and `GRIDONE_TIMEZONE` as environment
variables. Since TimescaleDB runs on the host machine, use `host.docker.internal`
instead of `localhost`:

=== "Mac / Windows (Docker Desktop)"

    ```sh
    docker run -p 8765:8765 \
      -e STORAGE_URL=postgresql://postgres:postgres@host.docker.internal:5432/gridone \
      -e GRIDONE_TIMEZONE=Europe/Paris \
      gridone
    ```

=== "Linux"

    ```sh
    docker run -p 8765:8765 \
      --add-host=host.docker.internal:host-gateway \
      -e STORAGE_URL=postgresql://postgres:postgres@host.docker.internal:5432/gridone \
      -e GRIDONE_TIMEZONE=Europe/Paris \
      gridone
    ```

The full stack (UI + API) is available at **`http://localhost:8765`**. Migrations run
automatically before the server starts.

The rest of this guide uses the dev server (`http://localhost:8000`). If using the
container, replace the host with `localhost:8765` and prefix all API paths with `/api/`
— e.g. `http://localhost:8765/api/auth/token`.

---

## 4. Authenticate

The API uses OAuth2 password grant. Send credentials as a form body:

```sh
curl -X POST http://localhost:8000/auth/token \
  -d "grant_type=password&username=admin&password=admin"
```

A default `admin` / `admin` account is created automatically on first start when no
users exist. Response:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

Pass the `access_token` as a bearer token on every subsequent request:

```
Authorization: Bearer <access_token>
```

---

## 5. Make your first request

```sh
curl http://localhost:8000/devices/ \
  -H "Authorization: Bearer <access_token>"
```

An empty list `[]` confirms the stack is live, migrations ran, and your token is
valid.

---

## Next steps

- [API Reference](../api-reference.md) — full endpoint documentation, try requests
  directly from the browser
- [Integrator track](integrators.md) — connect your first device (register a driver,
  add a device, verify live data)
