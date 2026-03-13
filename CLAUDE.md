# Claude x Gridone

## Project context

This project is a building management system (BMS) implemented in python. The goal of this software is to provide users control over their building's equipments (chillers, thermostats, boilers...), record data and metrics from them and automate workflows.

It is at the core of its design to be extensible. Extensible in several directions:
- *devices support* (in `devices-manager`): new devices can be easily added using yaml-based drivers, a registry of transport clients for many protocols (http, mqtt, bacnet, modbus...), and value adapters that can convert raw device values to internal data types. The source code must never mention a specific device or vendor - all vendor specific data lives in a driver file as input data;
- *api-first*: features of the BMS needs to be basic and very robust, but it offers an easy-to-use and performant http API to serve as a platform for developping building applications for specific use cases (and later, also a Model Context Protocol controller, as well as language-specific client libraries / sdks).

To summarize: the key of this project is extensibility and ease of deployment for users.

## Project structure

This project is a monorepo.

It has a python backend split into components in `packages/`. Each component handles a specific module or feature of the system, is responsible for its storage and exposes a high-level API. The `api` package is an http controller that bootstraps all components.

The `apps` directory contains apps that can actually run. It has a server that runs the API, a cli tool (mainly for testing), and a UI web application built with react and typescript.

Dependencies for python are managed with [`uv`](https://docs.astral.sh/uv/) workspaces.

```
.
├── CLAUDE.md
├── README.md
├── apps
│   ├── api_server
│   │   ├── README.md
│   │   ├── logging_config.py
│   │   ├── main.py
│   │   └── pyproject.toml
│   ├── cli
│   │   ├── README.md
│   │   ├── pyproject.toml
│   │   ├── src
│   │   └── tests
│   └── ui
│       ├── README.md
│       ├── components.json
│       ├── dist
│       ├── eslint.config.mts
│       ├── index.css
│       ├── index.html
│       ├── node_modules
│       ├── package-lock.json
│       ├── package.json
│       ├── postcss.config.js
│       ├── src
│       ├── tailwind.config.js
│       ├── tsconfig.app.json
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       └── vite.config.ts
├── config.yaml
├── docker
│   ├── Dockerfile
│   ├── nginx.conf
│   └── supervisord.conf
├── node_modules
├── packages
│   ├── api
│   │   ├── README.md
│   │   ├── pyproject.toml
│   │   ├── src
│   │   └── tests
│   ├── assets
│   │   └── src
│   ├── devices_manager
│   │   ├── README.md
│   │   ├── pyproject.toml
│   │   ├── src
│   │   └── tests
│   ├── models
│   │   ├── README.md
│   │   ├── pyproject.toml
│   │   └── src
│   ├── timeseries
│   │   ├── README.md
│   │   ├── pyproject.toml
│   │   ├── src
│   │   └── tests
│   └── users
│       ├── README.md
│       ├── pyproject.toml
│       └── src
├── pyproject.toml
└── uv.lock
```

## Tools

### Python

Python packages all use `ruff` for linting and formatting, `ty` for type-checking and `pytest` for tests.

After each modification, ensure all their rules are respected. You can run `prek run --all-files` to check all hooks.

### Typescript

The `apps/ui` typescript / react project uses:

- `eslint` for linting (`npm run lint`)
- `prettier` for formatting (`npm run format -- --write`)
- `typescript` for type-checking (`npm run type-check`)
- `vitest` / RTL for tests (`npm run test`)

See `package.json` for more info.

## Best practices

- Enforce all quality tools
- Target ~90% coverage (with the exception of UI, where you can only test critical components)
- Respect the project architecture, drive it towards long-term maintenability
- Help improve the CI workflows for fast feedback
- When moving files, use `git mv` to preserve history rather than deleting / recreating them

## Useful commands

```sh
# Run git hooks with prek
prek run -a
prek run --stage pre-commit
prek run --stage pre-push
```
