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
# Stage 2: Build Python virtualenv with all dependencies
# =============================================================================
FROM python:3.13-slim AS python-build

# Build-time dependencies for compiling C-extension wheels (asyncpg, etc.)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Copy workspace definition + lock file first (layer cache)
COPY pyproject.toml uv.lock ./

# Copy each workspace member's pyproject.toml so uv can resolve the workspace
COPY packages/api/pyproject.toml packages/api/pyproject.toml
COPY packages/devices_manager/pyproject.toml packages/devices_manager/pyproject.toml
COPY apps/api_server/pyproject.toml apps/api_server/pyproject.toml
COPY apps/cli/pyproject.toml apps/cli/pyproject.toml
COPY apps/migrations/pyproject.toml apps/migrations/pyproject.toml

# Copy the full source for installable packages
COPY packages/ packages/
COPY apps/api_server/ apps/api_server/
COPY apps/cli/ apps/cli/
COPY apps/migrations/ apps/migrations/

# Sync all workspace packages
# --frozen: don't update uv.lock, use it as-is
# --no-dev: skip dev-only dependencies
# --all-packages: install every workspace member so all runtime imports resolve
RUN uv sync --frozen --no-dev --all-packages && \
    uv pip install --no-cache websockets


# =============================================================================
# Stage 3: Production runtime (no build tools, no uv, no gcc)
# =============================================================================
FROM python:3.13-slim AS production

# Runtime-only system dependencies
# libpq5: PostgreSQL client library needed by asyncpg at runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx supervisor libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV GRIDONE_ENV=production

# Copy the pre-built virtualenv from the build stage
COPY --from=python-build /app/.venv /app/.venv

# Copy application source (needed for editable installs / imports)
COPY --from=python-build /app/packages /app/packages
COPY --from=python-build /app/apps /app/apps
COPY --from=python-build /app/pyproject.toml /app/pyproject.toml

# Copy built UI assets from stage 1
COPY --from=ui-build /build/apps/ui/dist /app/static

# nginx & supervisord configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Ensure the venv is on PATH
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 80

# Run database migrations, then start supervisord as PID 1.
# Supervisord will exit if either child process dies, ensuring the
# container stops cleanly.
CMD ["sh", "-c", "python -m migrations apply && exec supervisord -c /etc/supervisor/conf.d/supervisord.conf"]
