# Gridone CLI

A command line interface for to interact with gridone core, built with [typer](https://typer.tiangolo.com/).

## Install

The CLI runs standalone — for example on a remote host, to test drivers and
transports on the fly. It depends on the devices manager only, so there's no
need to install the full workspace. From the repo root:

```sh
uv sync --package cli
source .venv/bin/activate
gridone --help
```

`uv sync --package cli` resolves only the `cli` workspace member and its
dependency closure (devices manager + models + transport libs + typer), leaving
out the other service packages (`api`, `timeseries`, `users`, …) and their
dependencies such as `fastapi`.

## Configuration

The CLI reads a single environment variable, `STORAGE_URL`, and passes it
through to the devices manager's storage factory. Set it in a `.env` file at
the repo root (or export it). The factory parses the scheme and builds the
matching backend:

```sh
# YAML file db (e.g. a ".db" directory at the repo root)
STORAGE_URL=yaml:.db

# PostgreSQL
STORAGE_URL=postgresql://user:password@localhost:5432/postgres
```

If `STORAGE_URL` is unset, the CLI runs against an empty in-memory store.

## Usage

Some command examples for a device with id "my_thermostat":

```sh
gridone --help
gridone devices read my_thermostat
gridone devices write my_thermostat temperature_setpoint 21
gridone devices write my_thermostat state 1
gridone devices watch my_thermostat
```
