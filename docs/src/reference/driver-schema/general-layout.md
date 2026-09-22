# General Layout

A [driver](../glossary.md#driver) is a YAML file. Below is the full structure with all supported fields.

```yaml
id: <string>                  # (required) unique identifier for this driver

# Optional metadata
vendor: <string>              # equipment vendor / manufacturer
model: <string>               # device model name
version: <int>                # driver version
image_src: <string>           # URL or base64 image of the device — recommend square, 400×400
type: <string>                # standard device type (e.g. thermostat, awhp, weather_sensor)

transport: <protocol>         # (required)

env:                          # (optional) driver-scoped constants, reusable across attributes
  BASE_URL: "http://example.com/api"

device_config:                # (optional) parameters the user must supply per device instance
  - name: ip                  # e.g. IP address, device ID — interpolated as ${ip} in addresses

update_strategy:              # (optional) controls how often attributes are polled
  polling_interval: 30s       # or: polling: disable
  # or, named polling groups with per-group intervals:
  # polling_groups:
  #   core: 10s
  #   config: 1h

healthcheck:                  # (optional) controls how device liveness is assessed
  expected_push_interval: 30s

attributes:                   # (required) list of attribute drivers, see Attributes
  - name: temperature         # attribute identifier
    data_type: float          # float | int | bool | str
    read: ...                 # transport address for reading — see Transport Addresses
```

## Presentation

`presentation:` (optional) declares how the device page is composed — sections, controls, measurements and a graphic replica of the device screen — as data rendered by Gridone's generic widgets. See [Device Presentations](../device-presentations.md).

## Field reference

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique driver identifier |
| `transport` | yes | Protocol used to communicate with the device |
| `vendor` | no | Equipment vendor name |
| `model` | no | Device model name |
| `version` | no | Driver version number |
| `image_src` | no | URL or base64-encoded image of the physical device. Shown in the UI driver list and detail page. Recommended: square image, 400×400 px |
| `type` | no | Standard device type — enables schema validation and built-in UI. See [Standard Devices](../standard-devices.md) |
| `env` | no | Driver-scoped constants |
| `device_config` | no | Per-instance parameters (e.g. `ip`, `device_id`). See [Device config](../glossary.md#device-config) |
| `update_strategy` | no | Polling frequency configuration. See [Update strategy](../glossary.md#update-strategy) |
| `healthcheck` | no | Device liveness configuration. See [Health check](../glossary.md#health-check) |
| `attributes` | yes | List of readable/writable [attributes](../glossary.md#attribute). See [Attributes](attributes.md) |
| `discovery` | no | Auto-[discovery](../glossary.md#discovery) configuration (protocol-dependent). See [Discovery](discovery.md) |

Each attribute under `attributes` declares a `name`, a `data_type` and a `read` address. See [Attributes](attributes.md) for every attribute-level field: codecs, faults, presentation metadata and write constraints.

## Command validation

See [declarative command validation](command-validation.md) for write rules, dynamic
options and value mappings, defaults, previews, and server-resolved UI state.
