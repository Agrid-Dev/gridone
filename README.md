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
│   ├── core
│   └── storage
├── pyproject.toml
├── README.md
└── uv.lock
```

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

### Githooks (recommended)

To run checks before pushing, setup the githook :
```sh
chmod +x .githooks/setup.sh
bash .githooks/setup.sh
```

### Running with a proxy

If you need to route network calls through a proxy (for example when testing from a restricted network), prepend commands with `proxychains4`. A typical run looks like:

```sh
proxychains4 uv run python main.py
```

## Applications

Gridone can be executed as a [cli](apps/cli/README.md) or a fastapi [http server](apps/api_server/README.md).
