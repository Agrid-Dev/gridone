# Getting Started — Developers

This guide gets Gridone running as a local device-control layer so you can start
building applications against its API.

**"Want to contribute to Gridone?"**
    Contributors are welcome — head to the
    **[GitHub repository](https://github.com/Agrid-Dev/gridone)** to open issues or
    pull requests.

## Before you begin

You'll need **Docker** and **Docker Compose**.

---

## 1. Start the stack

Create a `docker-compose.yml`:

```yaml
services:
  timescaledb:
    image: timescale/timescaledb:latest-pg18
    container_name: timescaledb
    ports:
      - 5432:5432
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - timescaledb_data:/var/lib/postgresql/data

  gridone-app:
    image: ghcr.io/agrid-dev/gridone:latest
    container_name: gridone-app
    ports:
      - 8765:8765
    environment:
      STORAGE_URL: postgresql://postgres:postgres@timescaledb:5432/postgres
      GRIDONE_TIMEZONE: Europe/Paris
    restart: unless-stopped
    depends_on:
      - timescaledb

volumes:
  timescaledb_data:
```

Replace `Europe/Paris` with your building's IANA timezone name (e.g. `America/New_York`,
`Asia/Tokyo`). `GRIDONE_TIMEZONE` defaults to `UTC` if unset.

Then start both services:

```sh
docker compose up
```

Once both containers are healthy:

- **`http://localhost:8765`** — UI in your browser
- **`http://localhost:8765/api`** — HTTP API (see [API Reference](../api-reference.md))

Schema migrations run automatically before the server starts.

---

## 2. Authenticate

The API uses OAuth2 password grant. Send credentials as a form body:

```sh
curl -X POST http://localhost:8765/api/auth/token \
  -d "grant_type=password&username=admin&password=admin"
```

A default `admin` / `admin` account is created automatically on first start when no
users exist.

!!! warning "Change these credentials before going live"
    The `admin` / `admin` defaults are factory values. Update the password before
    exposing Gridone on a public or shared network.

Response:

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

## 3. Verify Gridone is up

```sh
curl http://localhost:8765/api/health
```

```json
{"status": "ok", "version": "vX.Y.Z", "flags": []}
```

---

## Next steps

- [API Reference](../api-reference.md) — full endpoint documentation, try requests
  directly from the browser
- [Integrator track](integrators.md) — connect your first device (register a driver,
  add a device, verify live data)
