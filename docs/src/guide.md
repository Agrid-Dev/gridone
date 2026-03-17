# User Guide

## Devices

A **device** is the fundamental object that Gridone controls. It represents any physical piece of building equipment — a thermostat, chiller, boiler, energy meter, sensor, or any other controllable or measurable unit.

Each device requires three things to work:

- **A driver** — a YAML file that describes the device model: its attributes, how to read and write them in the protocol it speaks. Multiple devices can use the same driver (typically all devices of a given vendor/model),
- **A transport** — a configured connection to the network (an MQTT broker, a Modbus gateway, an HTTP server...),
- **Device config** — device-specific parameters such as an IP address or device ID. The device config information required is specified by the driver. It is what's needed to uniquely identify the device.

In other words: the driver says how to speak to a device, a transport is where to speak to it, and the config is how to address it specifically.

The sections below document how to write a driver.

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

    # Value adapters (optional) — applied in order on read, reversed on write, if reversible
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

Each attribute under `attributes` must declare a `name`, a `data_type`, and at least one of `read`, `write`, or `read_write`. See [Attribute Drivers](#attribute-drivers) for full details.

---

### Transport Addresses

A transport address tells Gridone how to reach a specific value on a device. The syntax depends on the protocol declared in `transport`.

#### Access modes

| Field | When to use |
|---|---|
| `read` | The attribute is read-only |
| `write` | The attribute is write-only |
| `read_write` | The read and write address are identical — shorthand for declaring both |

`read_write` and `read`/`write` are mutually exclusive on a given attribute.

---

#### HTTP

The read address is a method + path string. The write address is an object with `method`, `path`, and an optional `body`.

```yaml
attributes:
  - name: temperature
    data_type: float
    read: "GET ${ip}/api/v1/status"
    json_pointer: /temperature

  - name: setpoint
    data_type: float
    read: "GET ${ip}/api/v1/status"
    json_pointer: /setpoint
    write:
      method: POST
      path: "${ip}/api/v1/setpoint"
      body:
        value: ${value}
```

`${ip}` and `${value}` are interpolated from `device_config` and the value being written respectively.

---

#### MQTT

Both read and write addresses are objects. `topic` is the topic to subscribe to or publish on. `request` triggers a message before reading.

```yaml
attributes:
  - name: temperature
    data_type: float
    read:
      topic: agrid/${device_id}/snapshot
      request:
        topic: agrid/${device_id}/get/snapshot
        message:
          input: request
    json_pointer: /temperature

  - name: setpoint
    data_type: float
    read:
      topic: agrid/${device_id}/snapshot
      request:
        topic: agrid/${device_id}/get/snapshot
        message:
          input: request
    write:
      topic: agrid/${device_id}/set/setpoint
      request:
        topic: agrid/${device_id}/set/setpoint
        message:
          value: ${value}
    json_pointer: /setpoint
```

---

#### Modbus TCP

Addresses are compact strings: `<type><instance>` or `<type><instance>:<count>` for multi-register values.

| Type | Code | Access |
|---|---|---|
| Coil | `C` | read / write |
| Discrete Input | `DI` | read only |
| Input Register | `IR` | read only |
| Holding Register | `HR` | read / write |

`IR` and `HR` support a register count suffix (`:2` for 32-bit values). Use `byte_convert` to specify how multi-register values are decoded.

```yaml
attributes:
  - name: temperature
    data_type: float
    read: IR0:2
    byte_convert: "float32 big_endian"

  - name: setpoint
    data_type: float
    read_write: HR0:2
    byte_convert: "float32 big_endian"

  - name: enabled
    data_type: bool
    read_write: C0
```

---

#### BACnet

Addresses reference a BACnet object by type and instance. The `device_instance` is provided via `device_config` and resolved at runtime.

Object types can be written in full (`analog-value`) or as initials (`AV`).

| Type | Initials | Access |
|---|---|---|
| `analog-input` | `AI` | read only |
| `analog-value` | `AV` | read / write |
| `binary-input` | `BI` | read only |
| `binary-value` | `BV` | read / write |
| `multistate-input` | `MI` | read only |
| `multistate-value` | `MV` | read / write |

An optional write priority (`P5`–`P16`) can be appended to the address.

```yaml
id: agrid_thermostat
transport: bacnet

device_config:
  - name: device_instance

attributes:
  - name: temperature
    data_type: float
    read: "AI 0"

  - name: setpoint
    data_type: float
    read_write: "AV 1"

  - name: enabled
    data_type: bool
    read_write: "BV 0 P8"
```
