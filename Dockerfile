# =============================================================================
# Stage 1: Build the Vite/React UI
# =============================================================================
FROM node:22-alpine AS ui-build

WORKDIR /build/apps/ui

# Install dependencies first (layer cache)
COPY apps/ui/package.json apps/ui/package-lock.json ./
RUN npm ci

# Copy UI source and build with a relative API base URL.
# This makes the SPA hit /api/... on the same origin, which nginx will proxy
# to the FastAPI backend.
COPY apps/ui/ ./
ENV VITE_API_BASE_URL=/api
RUN npm run build


# =============================================================================
# Stage 2: Python backend + nginx reverse proxy
# =============================================================================
FROM python:3.13-slim AS runtime

# --- System dependencies ---------------------------------------------------
# nginx:  reverse proxy / static file server
# supervisor: lightweight process manager (keeps uvicorn + nginx alive)
# gcc, libpq-dev: needed to build asyncpg and other C-extension wheels
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        nginx \
        supervisor \
        gcc \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# --- Install uv (fast Python package manager) ------------------------------
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# --- Python dependencies ---------------------------------------------------
WORKDIR /app

# Copy workspace definition + lock file first (layer cache)
COPY pyproject.toml uv.lock ./

# Copy each workspace member's pyproject.toml so uv can resolve the workspace
COPY packages/api/pyproject.toml packages/api/pyproject.toml
COPY packages/devices_manager/pyproject.toml packages/devices_manager/pyproject.toml
COPY apps/api_server/pyproject.toml apps/api_server/pyproject.toml
COPY apps/cli/pyproject.toml apps/cli/pyproject.toml

# Copy the full source for installable packages
COPY packages/ packages/
COPY apps/api_server/ apps/api_server/
COPY apps/cli/ apps/cli/

# Sync all workspace packages (api-server, gridone-api, gridone-devices-manager, etc.)
# --frozen: don't update uv.lock, use it as-is
# --no-dev: skip dev-only dependencies
# --all-packages: install every workspace member so all runtime imports resolve
RUN uv sync --frozen --no-dev --all-packages && \
    uv pip install --no-cache websockets

# --- Copy built UI assets from stage 1 -------------------------------------
COPY --from=ui-build /build/apps/ui/dist /app/static

# --- nginx configuration ---------------------------------------------------
COPY nginx.conf /etc/nginx/nginx.conf

# --- supervisord configuration ----------------------------------------------
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# --- Expose port 80 (nginx listens here inside the container) ---------------
EXPOSE 80

# --- Start both nginx and uvicorn via supervisord ---------------------------
# supervisord runs as PID 1 and will exit if either child process dies,
# ensuring the container stops cleanly.
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
