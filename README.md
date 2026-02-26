# GRIDONE

_Gridone_ is an open-source Building Management System (BMS) designed for extensibility and portability.

Gridone is built by [AGRID](https://a-grid.com/) and under development 🏗️ (unstable).

## Project layout

Gridone is a monorepo including both packages and applications.

```
.
├── apps
│   ├── api_server
│   ├── cli
│   └── ui
├── packages
│   ├── api
│   ├── devices_manager
│   └── storage
├── pyproject.toml
├── README.md
└── uv.lock
```

## Storage

`devices_manager` uses pluggable storage configured with a single URL string:

- Local development: YAML file backend using a path (example: `.db` or `/tmp/gridone-db`)
- Production: PostgreSQL-compatible backend (example: `postgresql://...`)

TimescaleDB is PostgreSQL-compatible, so it uses the same `postgresql://` URL format.

## Setup

### Installation

This project is managed with [uv](https://docs.astral.sh/uv/) using `workspaces`. Run

```sh
uv sync --all-packages
```
To create a virtual environment and install all project dependencies.

### Tooling

Gridone uses [astral.sh](https://astral.sh) python development tools:
- [ruff](https://docs.astral.sh/ruff/) for linting and formatting,
- [ty](https://docs.astral.sh/ty/) for type checking,

See astral's documentation for IDE integration.

Along with [pytest](https://docs.pytest.org/en/stable/) for tests.

```sh
uv run ruff check # linting
uv run ruff format # formatting
uv run ruff format --check # format check
uv run ty check # type check
uv run pytest # runs all tests
uv run pytest -m "not integration" # run unit tests
uv run pytest -m integration # run integration tests
```

### Git hooks (recommended)

This project uses [prek](https://prek.j178.dev/) to manage git hooks. Install prek, then run:
```sh
prek install -t commit-msg -t pre-commit -t pre-push
```

This sets up:
- **Commit-msg**: [conventional commits](https://www.conventionalcommits.org/) enforcement
- **Pre-commit**: ruff check, ruff format (Python), eslint, prettier (UI)
- **Pre-push**: ty check, pytest (Python), type-check, vitest (UI)

Frontend hooks only run when `apps/ui/` files are changed.

### Running with a proxy

If you need to route network calls through a proxy (for example when testing from a restricted network), prepend commands with `proxychains4`. A typical run looks like:

```sh
proxychains4 uv run python main.py
```

## Applications

Gridone can be executed as a [cli](apps/cli/README.md) or a fastapi [http server](apps/api_server/README.md).
