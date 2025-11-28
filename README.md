# GRIDONE (WiP 🏗️)

_Gridone_ is an open-source Building Management System (BMS) designed for extensibility and portability.

Gridone is built by [AGRID](https://a-grid.com/) and welcomes all contributors.

## Project structure

```mermaid
classDiagram

class Device {
    +id: str
    +config: dict
    +driver: Driver
    +attributes: dict[str, Attribute]
}

class Driver {
    +env: dict
    +transport: TransportClient
    +schema: DeviceSchema
}

class Attribute
class TransportClient
class DeviceSchema

Device *-- Driver
Device *-- Attribute : attributes (many)
Driver *-- TransportClient
Driver *-- DeviceSchema
```

## Setup

### Installation

This project is managed with [uv](https://docs.astral.sh/uv/). Run

```sh
uv sync
```
To create a virtual environment and install project dependencies.

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
uv run pytest # runs tests
```

### Running with a proxy

If you need to route network calls through a proxy (for example when testing from a restricted network), prepend commands with `proxychains4`. A typical run looks like:

```sh
proxychains4 uv run python main.py
```

## MQTT driver payloads

Define MQTT `message` payloads as YAML structures rather than JSON strings; the transport will serialize dict payloads to JSON before publishing. Examples:

```yaml
address:
  topic: "agrid/thermostat/command"
  request:
    topic: "${mac}"
    message:
      command: READ_DATA
      data: Temperature
```

For nested payloads:

```yaml
message:
  command: SET_CONFIG
  data:
    temperature:
      target: 22
      unit: celsius
    mode: heating
    schedule:
      enabled: true
      times:
        - start: "06:00"
          temp: 20
        - start: "22:00"
          temp: 18
```

### Running with a proxy

If you need to route network calls through a proxy (for example when testing from a restricted network), prepend commands with `proxychains4`. A typical run looks like:

```sh
proxychains4 uv run python main.py
```
