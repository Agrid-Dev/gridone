# Transport Addresses

A transport address declares how to read and/or write an attribute value on a device in its native protocol, as declared in the `transport` field at driver level.

## Access modes

| Field | When to use |
|---|---|
| `read` | The address for reading the attribute value |
| `write` | The address for writing/updating the attribute value |
| `read_write` | The read and write address are identical — shorthand for declaring both |

`read_write` and `read`/`write` are mutually exclusive on a given attribute. If `read_write` is present, it takes precedence.

---

## Templating

Address strings and fields support `${key}` interpolation. Keys are resolved in this order:

- Values declared in the driver's `env` block
- Values provided in the device's `device_config`

```yaml
env:
  BASE_PATH: "http://192.168.1.1/api"

device_config:
  - name: ip
```

```yaml
read: "GET ${BASE_PATH}/status"   # from env
read: "GET ${ip}/api/v1/status"   # from device_config
```

`${value}` is a reserved keyword available only in write address payloads. It is replaced at runtime by the actual value being written by the client.

```yaml
write:
  method: POST
  path: "${ip}/api/v1/setpoint"
  body:
    value: ${value}
```

---

## Address reference per protocol

### HTTP

Both read and write addresses accept either a compact string or an object.

**String format** — `"<METHOD> <path>"` — use when no body is needed:

```yaml
read: "GET ${ip}/api/v1/status"
write: "POST ${ip}/attribute?value=${value}"
```

**Object format** — use when a body is required or for explicitness:

| Field | Required | Description |
|---|---|---|
| `method` | yes | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| `path` | yes | URL of the endpoint |
| `body` | no | Request body — a `dict` (sent as JSON on write, form data on read) or a raw `str` (sent as-is) |

```yaml
read:
  method: GET
  path: "${ip}/api/v1/status"

write:
  method: POST
  path: "${ip}/api/v1/setpoint"
  body:
    value: ${value}

write:
  method: POST
  path: "${ip}/api/v1/setpoint"
  body: "raw string payload"
```

---

### MQTT

Read and write addresses each have a `topic` to subscribe to or publish on.

**Read — listen-only** (string): subscribe to a topic and consume whatever arrives, no outgoing trigger.

```yaml
read: agrid/${device_id}/snapshot
```

**Read — with request trigger** (object): subscribe to `topic` and publish a trigger message on `request.topic` before waiting for a response.

```yaml
read:
  topic: agrid/${device_id}/snapshot
  request:
    topic: agrid/${device_id}/get/snapshot
    message:
      input: request
```

**Write**: publish `message` to `topic`.

```yaml
write:
  topic: agrid/${device_id}/set/setpoint
  message:
    value: ${value}
```

---

### Modbus TCP

Addresses are compact strings: `<type><instance>` or `<type><instance>:<count>` for values that span multiple registers. An object format is also accepted (`type`, `instance`, `count`) but the string notation is preferred.

| Type | Code | Access | Data types |
|---|---|---|---|
| Coil | `C` | read / write | `bool` |
| Discrete Input | `DI` | read only | `bool` |
| Input Register | `IR` | read only | `int`, `float`, `str` |
| Holding Register | `HR` | read / write | `int`, `float`, `str` |

`IR` and `HR` support a register count suffix (`:2` for 32-bit values). Use `byte_convert` to specify how multi-register values are decoded — see [Value Adapters](value-adapters.md).

```yaml
read: IR0:2       # Input Register 0, 2 registers (32-bit)
read_write: HR0:2 # Holding Register 0, 2 registers
read_write: C0    # Coil 0

read_write:
  type: IR
  instance: 4
```

---

### BACnet

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

An optional BACnet write priority (`P5`–`P16`) can be appended to the address (priorities below 5 are not allowed by design).

```yaml
read: "AI 0"          # Analog Input 0 — read only
read_write: "AV 1"    # Analog Value 1
read_write: "BV 0 P8" # Binary Value 0, write priority 8

read:
  object_type: analog-value
  object_instance: 4
  property_name: present-value
```

---

### KNX

The address is a KNX group address string in three-level notation (`main/middle/sub`). Supports `${key}` templating from `device_config`.

On write, no payload is configured in the address — the value is sent as a KNX telegram encoded by the `knx_dpt` adapter.

```yaml
read: "${ga_main}/${ga_middle}/4"        # listen-only
read_write: "${ga_main}/${ga_middle}/1"  # read and write

read:
  topic: "${ga_main}/${ga_middle}/4"     # object form
```
