# Value Adapters

Value adapters transform the raw value exchanged with a device into the internal typed value Gridone works with — and back again when writing.

They are declared as keys directly on an attribute, alongside `read`/`write`:

```yaml
- name: temperature
  data_type: float
  read: IR0:2
  byte_convert: "float32 big_endian"
```

## Reversible vs non-reversible

An adapter is **reversible** if it can transform in both directions: decode (raw → internal) on read, and encode (internal → raw) on write. Both directions are applied automatically.

A **non-reversible** adapter only has a decode function. It transforms the raw value on read but is skipped on write — meaning it should not be used on writable attributes where the write path depends on that transformation.

| Adapter | Reversible |
|---|---|
| `scale` | yes |
| `bool_format` | yes |
| `byte_convert` | yes |
| `base64` | yes |
| `byte_frame` | yes |
| `json_pointer` | no |
| `json_path` | no |
| `slice` | no |

---

## Supported adapters

### `json_pointer`

Extracts a value from a JSON object or string using an [RFC 6901](https://datatracker.ietf.org/doc/html/rfc6901) pointer. Typically used with HTTP and MQTT responses.

| | |
|---|---|
| Argument | JSON pointer path (e.g. `/sensors/temperature`) |
| Input | `dict`, JSON string, or bytes |
| Output | any |
| Reversible | no |

```yaml
- name: temperature
  data_type: float
  read: "GET ${ip}/api/v1/status"
  json_pointer: /temperature
```

---

### `json_path`

Extracts a value from a JSON object using a [JSONPath](https://goessner.net/articles/JsonPath/) expression.

| | |
|---|---|
| Argument | JSONPath expression (e.g. `$.sensors[0].value`) |
| Input | `dict` |
| Output | any |
| Reversible | no |

```yaml
- name: temperature
  data_type: float
  read: "GET ${ip}/api/v1/status"
  json_path: "$.sensors[0].temperature"
```

---

### `scale`

Multiplies the value by a factor on read, divides on write. Use when a device reports values in a different unit or resolution.

| | |
|---|---|
| Argument | numeric factor |
| Input | `float` |
| Output | `float` |
| Reversible | yes — encode divides by the same factor |

```yaml
- name: temperature
  data_type: float
  read_write: HR0
  scale: 0.1   # device reports in tenths of a degree
```

---

### `bool_format`

Converts between an integer `0`/`1` and a boolean. Only `"0/1"` is supported as argument.

| | |
|---|---|
| Argument | `"0/1"` |
| Input | `int` (`0` or `1`) |
| Output | `bool` |
| Reversible | yes — encode converts `bool` back to `int` |

```yaml
- name: enabled
  data_type: bool
  read_write: HR5
  bool_format: "0/1"
```

---

### `byte_convert`

Converts raw Modbus register values (or bytes) to a typed value. Argument format: `"<type>"` or `"<type> <endian>"`.

Supported types: `uint8`, `int8`, `uint16`, `int16`, `bool`, `uint32`, `int32`, `float32`, `hex32`, `uint64`, `int64`, `float64`, `hex64`.

Endianness: `big_endian` or `little_endian` (default when omitted).

| | |
|---|---|
| Argument | `"<type>"` or `"<type> big_endian \| little_endian"` |
| Input | register value(s) or bytes |
| Output | typed value (`int`, `float`, `bool`, `str`) |
| Reversible | yes |

```yaml
- name: temperature
  data_type: float
  read_write: HR0:2
  byte_convert: "float32 big_endian"
```

---

### `base64`

Decodes a base64-encoded string to raw bytes on read, encodes bytes back to base64 on write.

| | |
|---|---|
| Argument | any string (ignored) |
| Input | base64 `str` |
| Output | `bytes` |
| Reversible | yes |

```yaml
- name: payload
  data_type: str
  read: "GET ${ip}/api/v1/data"
  json_pointer: /encoded
  base64: "standard"
```

---

### `byte_frame`

Extracts the byte immediately after a known prefix on read. On write, prepends the prefix to the value byte. Useful for proprietary binary protocols.

| | |
|---|---|
| Argument | hex prefix string (e.g. `"11 05 00 13"`) |
| Input | `bytes` |
| Output | `int` |
| Reversible | yes |

```yaml
- name: mode
  data_type: int
  read_write: HR10
  byte_frame: "11 05 00 13 00 55"
```

---

### `slice`

Slices a sequence (bytes or list) using Python slice notation.

| | |
|---|---|
| Argument | `"start:end"` or `"start:end:step"` |
| Input | sequence (`bytes`, `list`) |
| Output | subsequence |
| Reversible | no |

```yaml
- name: serial
  data_type: str
  read: "GET ${ip}/api/v1/info"
  json_pointer: /raw_bytes
  base64: "standard"
  slice: "0:4"
```

---

## Chaining

Multiple adapters can be declared on the same attribute. They are applied in the order they appear in the YAML file.

**On read:** adapters run top-to-bottom — the output of each becomes the input of the next.

**On write:** adapters run in reverse order — each encoder is applied from last to first.

If a non-reversible adapter is in the chain, it is skipped on write (its encode is a no-op).

### Example — integer register with scaling

A device reports temperature as a signed 16-bit integer in tenths of a degree (e.g. `215` = 21.5 °C).

```yaml
- name: temperature
  data_type: float
  read_write: HR0
  byte_convert: "int16 big_endian"  # step 1: registers → int
  scale: 0.1                        # step 2: int → float (÷10)
```

Read: `[0x00, 0xD7]` → `215` (byte_convert) → `21.5` (scale)

Write: `21.5` → `215` (scale encode: ÷0.1) → `[0x00, 0xD7]` (byte_convert encode)

### Example — base64-encoded binary payload

A device returns a base64 string containing a binary frame. The value is at bytes 0–3 as a float.

```yaml
- name: temperature
  data_type: float
  read: "GET ${ip}/api/v1/snapshot"
  json_pointer: /data          # step 1: extract base64 string from JSON
  base64: "standard"           # step 2: decode to bytes
  slice: "0:4"                 # step 3: take first 4 bytes
  byte_convert: "float32 big_endian"  # step 4: bytes → float
```

Read: JSON → base64 string (json_pointer) → bytes (base64) → 4-byte slice (slice) → float (byte_convert)

Write: not applicable — `json_pointer` and `slice` are non-reversible, this attribute should be declared read-only.
