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

## HTTP

The read address is a plain string: `"<METHOD> <path>"`.

```yaml
read: "GET ${ip}/api/v1/status"
```

The write address is an object:

| Field | Required | Description |
|---|---|---|
| `method` | yes | HTTP method: `GET`, `POST`, `PATCH`, etc. |
| `path` | yes | URL of the endpoint |
| `body` | no | JSON payload sent with the request |

```yaml
write:
  method: POST
  path: "${ip}/api/v1/setpoint"
  body:
    value: ${value}
```

---

## MQTT

Both read and write addresses are objects. `topic` is the topic to subscribe to or publish on. The `request` field triggers a message before reading, or sends an update when writing.

Read address:

```yaml
read:
  topic: agrid/${device_id}/snapshot
  request:
    topic: agrid/${device_id}/get/snapshot
    message:
      input: request
```

Write address:

```yaml
write:
  topic: agrid/${device_id}/set/setpoint
  request:
    topic: agrid/${device_id}/set/setpoint
    message:
      value: ${value}
```

---

## Modbus TCP

Addresses are compact strings: `<type><instance>` or `<type><instance>:<count>` for values that span multiple registers.

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
```

---

## BACnet

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
```
