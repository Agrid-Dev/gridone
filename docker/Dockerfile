# =============================================================================
# Stage 1: Build the Vite/React UI
# =============================================================================
FROM node:22-alpine AS ui-build

# Build the local SDK first: the UI depends on it via file:../../sdk/ts and
# its entry points live in its (gitignored) dist/ directory.
WORKDIR /build/sdk/ts
COPY sdk/ts/package.json sdk/ts/package-lock.json ./
RUN npm ci
COPY sdk/ts/ ./
RUN npm run build

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

# Copy EVERY workspace member's pyproject.toml (and nothing else) so uv can
# resolve the full workspace graph without the source. This is what makes the
# heavy dependency-install layer below cacheable: it depends only on the lock
# file and these manifests, so it is reused across releases until uv.lock or a
# member's dependency set changes.
COPY packages/api/pyproject.toml packages/api/pyproject.toml
COPY packages/apps/pyproject.toml packages/apps/pyproject.toml
COPY packages/assets/pyproject.toml packages/assets/pyproject.toml
COPY packages/automations/pyproject.toml packages/automations/pyproject.toml
COPY packages/commands/pyproject.toml packages/commands/pyproject.toml
COPY packages/devices_manager/pyproject.toml packages/devices_manager/pyproject.toml
COPY packages/models/pyproject.toml packages/models/pyproject.toml
COPY packages/notifications/pyproject.toml packages/notifications/pyproject.toml
COPY packages/timeseries/pyproject.toml packages/timeseries/pyproject.toml
COPY packages/users/pyproject.toml packages/users/pyproject.toml
COPY apps/api_server/pyproject.toml apps/api_server/pyproject.toml
COPY apps/cli/pyproject.toml apps/cli/pyproject.toml
COPY apps/migrations/pyproject.toml apps/migrations/pyproject.toml

# Install all third-party dependencies WITHOUT the workspace packages.
# This is the heavy, cacheable layer (128 packages, C-extension wheels).
# --frozen: don't update uv.lock, use it as-is
# --no-dev: skip dev-only dependencies
# --all-packages: resolve dependencies of every workspace member
# --no-install-workspace: skip the first-party packages themselves (no source
#   needed yet), so this layer only rebuilds when uv.lock changes
RUN uv sync --frozen --no-dev --all-packages --no-install-workspace

# Copy the full source for installable packages
COPY packages/ packages/
COPY apps/api_server/ apps/api_server/
COPY apps/cli/ apps/cli/
COPY apps/migrations/ apps/migrations/

# Install the workspace packages themselves. Cheap: their dependencies are
# already present from the cached layer above, so a source-only change reruns
# only this step.
RUN uv sync --frozen --no-dev --all-packages

# Extract app version so the production stage can expose it via GRIDONE_VERSION
RUN python -c "import tomllib; print(tomllib.load(open('pyproject.toml','rb'))['project']['version'])" > /tmp/gridone_version


# =============================================================================
# Stage 3: Production runtime (no build tools, no uv, no gcc)
# =============================================================================
FROM python:3.13-slim AS production

# Runtime-only system dependencies
# libpq5: PostgreSQL client library needed by asyncpg at runtime
# gettext-base: provides envsubst, used to render nginx.conf.template at startup
RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx supervisor libpq5 gettext-base \
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

# App version for the health endpoint
COPY --from=python-build /tmp/gridone_version /tmp/gridone_version

# nginx & supervisord configuration
COPY docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Ensure the venv is on PATH
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8765

# Render nginx.conf from its template, run database migrations, then start
# supervisord as PID 1. Supervisord will exit if either child process dies,
# ensuring the container stops cleanly.
CMD ["sh", "-c", "\
    export GRIDONE_VERSION=$(cat /tmp/gridone_version) && \
    export NGINX_BIND_ADDRESS=${NGINX_BIND_ADDRESS:-0.0.0.0} && \
    envsubst '${NGINX_BIND_ADDRESS}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && \
    python -m migrations apply && \
    exec supervisord -c /etc/supervisor/conf.d/supervisord.conf \
"]
