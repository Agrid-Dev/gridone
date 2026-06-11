# Gridone Docker image

A single production container that serves the whole stack:

- **nginx** — serves the built Vite SPA and reverse-proxies `/api/*` (HTTP + WebSocket) to uvicorn. Listens on `:8765`.
- **uvicorn** — the FastAPI backend (`gridone-api`) on `127.0.0.1:8000`.
- **supervisord** — PID 1; runs both processes and exits the container if either dies.

On startup the container renders `nginx.conf` from `nginx.conf.template`, applies database migrations (`python -m migrations apply`), then hands off to supervisord.

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build (UI → Python venv → slim runtime) |
| `nginx.conf.template` | nginx config; `${NGINX_BIND_ADDRESS}` rendered at startup via `envsubst` |
| `supervisord.conf` | Process supervision for nginx + uvicorn |

## Build

```sh
# From the repo root (build context must be the root)
docker build -f docker/Dockerfile -t gridone:local .
```

## Configuration

All configuration is via environment variables passed to the container.

| Variable | Default | Notes |
|---|---|---|
| `STORAGE_URL` | _(required)_ | PostgreSQL/TimescaleDB URL, e.g. `postgresql://user:pass@host:5432/gridone` |
| `GRIDONE_TIMEZONE` | `UTC` | IANA timezone for the building (e.g. `Europe/Paris`); validated at startup |
| `NGINX_BIND_ADDRESS` | `0.0.0.0` | Address nginx binds `:8765` to. Set `127.0.0.1` to expose only to loopback |
| `COOKIE_SECURE` | `true` | `Secure` flag on auth cookies. Set `false` only when served over **plain HTTP** |
| `SECRET_KEY` | _(random)_ | Token signing key. **Set a fixed value** in production so sessions survive restarts |

See [`apps/api_server/README.md`](../apps/api_server/README.md) for the full settings reference (tracing, logging, migrations).

## Deployment topologies

### Local / bridge networking

Publish the port and serve over plain HTTP. Defaults work as-is — `NGINX_BIND_ADDRESS=0.0.0.0` lets Docker's port forwarding reach nginx.

```yaml
services:
  gridone:
    image: gridone:local
    ports:
      - 8765:8765
    environment:
      STORAGE_URL: postgresql://postgres:postgres@db:5432/gridone
      GRIDONE_TIMEZONE: Europe/Paris
      # Served over http://localhost — opt out of Secure cookies.
      COOKIE_SECURE: "false"
```

Open `http://localhost:8765`.

> `localhost` is a secure context in Chrome/Firefox, so `COOKIE_SECURE=true` usually works there too. Set it to `false` for robustness across browsers (Safari) and any non-`localhost` plain-HTTP access.

### Production: host networking behind an HTTPS reverse proxy

Host networking is required so the app's **outbound** device discovery (BACnet `Who-Is` broadcasts, Modbus) reaches equipment on the building LAN. Public access goes through a reverse proxy or tunnel that terminates TLS and forwards to `http://localhost:8765`.

```yaml
services:
  gridone:
    image: gridone:local
    network_mode: host
    environment:
      STORAGE_URL: postgresql://postgres:postgres@localhost:5432/gridone
      GRIDONE_TIMEZONE: Europe/Paris
      # Only the local proxy reaches the API; do not expose it on the building LAN.
      NGINX_BIND_ADDRESS: 127.0.0.1
      # Public origin is HTTPS, so keep the default. Cookies stay Secure.
      COOKIE_SECURE: "true"
```

Key points for this topology:

- **`NGINX_BIND_ADDRESS=127.0.0.1`** — with host networking the default `0.0.0.0` would expose the plaintext UI/API to everyone on the building LAN. Binding to loopback restricts it to the local proxy. Device discovery is unaffected (it's outbound).
- **`COOKIE_SECURE=true`** — the browser-facing origin is HTTPS (terminated at the proxy), so cookies must carry `Secure`. The internal plaintext hop is invisible to the browser.
- **No `X-Forwarded-Proto` handling needed** — the SPA uses a relative `/api` base and cookies use the explicit flag, so nothing depends on scheme detection.

> **HTTP-only LAN install (no proxy/TLS):** keep `NGINX_BIND_ADDRESS=0.0.0.0` to serve on the LAN, and set `COOKIE_SECURE=false` — otherwise the browser silently refuses the `Secure` cookie over HTTP and login fails.
