# User Guide

## Devices

In Gridone, a **device** is any physical piece of building equipment — a thermostat, chiller, boiler, energy meter, sensor, or any other controllable or measurable unit.

Each device instance is the combination of three things:

- **A driver** — a YAML file that describes the device model: its attributes, how to read and write them, and which protocol it speaks
- **A transport** — a configured connection to the network (an MQTT broker, a Modbus gateway, an HTTP endpoint...)
- **Device config** — instance-specific parameters such as an IP address or device ID

The driver is the reusable part. One driver covers every device of the same model, regardless of where it is deployed. The sections below document how to write one.

---

## Driver Schema Reference

A driver is a YAML file. The sections below describe its structure.

### General Layout

```yaml
id: <string>                  # (required) unique identifier for this driver

# Optional metadata
vendor: <string>              # equipment vendor / manufacturer
model: <string>               # device model name
version: <int>                # driver version

transport: <protocol>         # (required)

env:                          # (optional) driver-scoped constants, reusable across attributes
  BASE_URL: "http://default-host"

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

    # Value adapters (optional) — applied in order on read, reversed on write
    json_pointer: /path       # extract a value from a JSON payload
    byte_convert: float32 big_endian
```

**Field reference**

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique driver identifier |
| `transport` | yes | Protocol used to communicate with the device |
| `vendor` | no | Equipment vendor name |
| `model` | no | Device model name |
| `version` | no | Driver version number |
| `env` | no | Driver-scoped constants |
| `device_config` | no | Per-instance parameters (e.g. `ip`, `device_id`) |
| `update_strategy` | no | Polling frequency configuration |
| `attributes` | yes | List of readable/writable device attributes |
| `discovery` | no | Auto-discovery configuration (protocol-dependent) |

Each attribute under `attributes` must declare a `name`, a `data_type`, and at least one of `read`, `write`, or `read_write`. Address syntax is protocol-specific — see [Transport Addresses](#transport-addresses). Value extraction and transformation are handled by [Value Adapters](#value-adapters).
