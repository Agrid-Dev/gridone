# General Layout

A driver is a YAML file. Below is the full structure with all supported fields.

```yaml
id: <string>                  # (required) unique identifier for this driver

# Optional metadata
vendor: <string>              # equipment vendor / manufacturer
model: <string>               # device model name
version: <int>                # driver version
type: <string>                # standard device type (e.g. thermostat, awhp, weather_sensor)

transport: <protocol>         # (required)

env:                          # (optional) driver-scoped constants, reusable across attributes
  BASE_URL: "http://example.com/api"

device_config:                # (optional) parameters the user must supply per device instance
  - name: ip                  # e.g. IP address, device ID — interpolated as ${ip} in addresses

update_strategy:              # (optional) controls how often attributes are polled
  period: 30s

attributes:                   # (required) list of attribute drivers
  - name: temperature         # attribute identifier
    data_type: float          # float | int | bool | str
    read: ...                 # transport address for reading — see Transport Addresses
    write: ...                # transport address for writing — omit if read-only
    # or:
    read_write: ...           # shorthand when read and write share the same address

    # Codecs (optional) — applied in order on read, reversed on write, if reversible
    codecs:
      - json_pointer: /path       # extract a value from a JSON payload
      - byte_convert: float32 big_endian
```

## Field reference

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique driver identifier |
| `transport` | yes | Protocol used to communicate with the device |
| `vendor` | no | Equipment vendor name |
| `model` | no | Device model name |
| `version` | no | Driver version number |
| `type` | no | Standard device type — enables schema validation and built-in UI. See [Standard Devices](standard-devices.md) |
| `env` | no | Driver-scoped constants |
| `device_config` | no | Per-instance parameters (e.g. `ip`, `device_id`) |
| `update_strategy` | no | Polling frequency configuration |
| `attributes` | yes | List of readable/writable device attributes |
| `discovery` | no | Auto-discovery configuration (protocol-dependent) |

Each attribute under `attributes` must declare a `name`, a `data_type`, and at least one of `read`, `write`, or `read_write`. See [Attribute Drivers](#attribute-drivers) for full details.
