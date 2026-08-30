# GRIDONE

_Gridone_ is an open-source Building Management System (BMS) for controlling building equipment (thermostats, chillers, boilers, and more), recording and querying their data, and automating workflows around them.

Gridone is built by [AGRID](https://a-grid.com/) and is under development 🏗️ (unstable).

## Objectives

- **Single, standardised API** — one HTTP API controls every device, independently of its communication protocol or vendor (and, longer term, an MCP controller and language-specific SDKs).
- **No vendor-specific code in the source** — all vendor detail lives as data in YAML device drivers, never in the codebase.
- **Device extensibility** — new devices are added through YAML-based drivers, a registry of transport clients (see [Protocol support](#protocol-support)), and composable codecs that convert raw device values to typed data.

## Protocol support

HTTP · MQTT · Modbus TCP · BACnet · KNX · M-Bus · OPC-UA · Webhook

See [Transports](https://docs.gridone.a-grid.com/reference/transports/) for the configuration reference of each.

## Quick start (Docker)

Gridone is easy to deploy: a single Docker image bundles the whole application. Follow the [Getting Started guide](https://docs.gridone.a-grid.com/getting-started/developers/) to write a `docker-compose.yml` and run:

```sh
docker compose up
```

See [`docker/README.md`](docker/README.md) for building the image locally and production deployment topologies (host networking for building-LAN device discovery, HTTPS reverse proxy setup, etc).

## CLI usage

A [CLI](apps/cli/README.md) is available for testing and prototyping devices, drivers and transports without the full stack.

## Documentation

Full documentation is available at [docs.gridone.a-grid.com](https://docs.gridone.a-grid.com).

## API reference

A Bruno request collection covering all API endpoints lives at [`requests/`](requests/). See [`packages/api/README.md#api-reference`](packages/api/README.md#api-reference) for setup instructions.

## Contributing

Setting up a development environment, running tests, and the project's architecture are covered in [`CONTRIBUTING.md`](CONTRIBUTING.md).
