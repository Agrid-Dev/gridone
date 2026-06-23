# Codecs

[Codecs](../glossary.md#codec) **decode** the raw value exchanged with a [device](../glossary.md#device) into the internal typed value Gridone works with — and **encode** it back for writing.

They are declared as an explicit `codecs` list on an [attribute](../glossary.md#attribute). Each entry is a single-key object whose key is the codec identifier and whose value is the argument:

```yaml
- name: temperature
  data_type: float
  read_write: HR0:2
  codecs:
    - byte_convert: "float32 big_endian"
```

---

## Read vs write codecs

The attribute-level `codecs` list applies to **both** directions — decode on read, encode on write.

When a device's read format differs from its write format, codecs can also be declared **per direction**, inside the `read:` / `write:` [address](transport-addresses.md) (object form):

```yaml
- name: temperature_setpoint
  data_type: float
  read:
    topic: device/${id}/status
    codecs:
      - json_pointer: /target
  write:
    topic: device/${id}/cmd
    codecs:
      - base64: ""
      - byte_frame: "0e"   # encode runs bottom-to-top: wrap with 0e, then base64
```

For each direction, the codecs on that direction's address are used if present; otherwise the attribute-level `codecs` apply. If neither is set, the raw value is read and written unchanged.

Most devices need only the attribute-level list. Per-direction codecs are for the cases where decoding a reading and encoding a command genuinely differ, so you override just the direction that differs without repeating the shared codecs.

---

## Reversible vs non-reversible

A codec is **reversible** if it implements both directions: **decode** (transport → Gridone) on read, and **encode** (Gridone → transport) on write. Both are applied automatically.

A **non-reversible** codec only implements decode. It is skipped on write (falls back to identity) — meaning it should not be used on writable attributes where the write path depends on that transformation.

| Codec | Reversible |
|---|---|
| `json_pointer` | no |
| `json_path` | no |
| `scale` | yes |
| `offset` | yes |
| `bool_format` | yes |
| `byte_convert` | yes |
| `base64` | yes |
| `byte_frame` | yes |
| `slice` | no |
| `knx_dpt` | yes |
| `mapping` | yes |
| `options` | yes |

---

## Supported codecs

### `json_pointer`

Decodes a value from a JSON object or string using an [RFC 6901](https://datatracker.ietf.org/doc/html/rfc6901) pointer. Typically used with HTTP and MQTT responses.

| | |
|---|---|
| Argument | JSON pointer path (e.g. `/data/temperature`) |
| Input | `dict`, JSON string, or bytes |
| Output | any |
| Reversible | no |

```yaml
codecs:
  - json_pointer: /data/temperature
```

**Decode examples:**

| Input | Argument | Output |
|---|---|---|
| `{"data": {"temperature": 21.5, "pressure": 1013}}` | `/data/temperature` | `21.5` |
| `{"data": {"temperature": 21.5, "pressure": 1013}}` | `/data/pressure` | `1013` |
| `{"enabled": true}` | `/enabled` | `true` |

---

### `json_path`

Decodes a value from a JSON object using a [JSONPath](https://goessner.net/articles/JsonPath/) expression.

| | |
|---|---|
| Argument | JSONPath expression (e.g. `$.sensors[0].value`) |
| Input | `str`, `dict` |
| Output | any |
| Reversible | no |

```yaml
codecs:
  - json_path: "$.sensors[0].temperature"
```

**Decode examples:**

| Input | Argument | Output |
|---|---|---|
| `{"sensors": [{"temperature": 21.5}]}` | `$.sensors[0].temperature` | `21.5` |

---

### `scale`

Decodes by multiplying the raw value by a factor. Encodes by dividing. Use when a device reports values in a different unit or resolution.

| | |
|---|---|
| Argument | numeric factor |
| Input | `float` |
| Output | `float` |
| Reversible | yes |

```yaml
codecs:
  - scale: 0.1
```

**Decode / encode examples:**

| Raw value | Argument | Decoded | Encoded back |
|---|---|---|---|
| `215` | `0.1` | `21.5` | `215` |
| `1000` | `0.01` | `10.0` | `1000` |
| `72` | `0.5` | `36.0` | `72` |

---

### `offset`

Decodes by adding a constant to the raw value. Encodes by subtracting it. Commonly chained with `scale` to express a linear conversion such as `(raw + offset) × scale`.

| | |
|---|---|
| Argument | numeric constant |
| Input | `float` |
| Output | `float` |
| Reversible | yes |

```yaml
codecs:
  - offset: constant_value   # e.g. -40
```

**Decode / encode examples:**

| Raw value | Argument | Decoded | Encoded back |
|---|---|---|---|
| `100` | `5` | `105` | `100` |
| `60` | `-40` | `20` | `60` |

---

### `bool_format`

Decodes an integer `0`/`1` to a boolean. Encodes a boolean back to `0`/`1`. Only `"0/1"` is supported as argument.

| | |
|---|---|
| Argument | `"0/1"` |
| Input | `int` (`0` or `1`) |
| Output | `bool` |
| Reversible | yes |

```yaml
codecs:
  - bool_format: "0/1"
```

**Decode / encode examples:**

| Raw value | Decoded | Encoded back |
|---|---|---|
| `0` | `false` | `0` |
| `1` | `true` | `1` |

---

### `byte_convert`

Decodes raw register values or bytes into a typed value. Encodes back to registers/bytes for writing.

Argument format: `"<type>"` or `"<type> <endian>"`. Default endianness is `little_endian` when omitted.

Supported types: `uint8`, `int8`, `uint16`, `int16`, `bool`, `uint32`, `int32`, `float32`, `hex32`, `uint64`, `int64`, `float64`, `hex64`.

| | |
|---|---|
| Argument | `"<type>"` or `"<type> big_endian \| little_endian"` |
| Input | register value(s) or bytes |
| Output | typed value (`int`, `float`, `bool`, `str`) |
| Reversible | yes |

```yaml
codecs:
  - byte_convert: "float32 big_endian"
```

**Decode / encode examples:**

| Raw registers | Argument | Decoded | Encoded back |
|---|---|---|---|
| `[0x41, 0xAC, 0x00, 0x00]` | `float32 big_endian` | `21.5` | `[0x41, 0xAC, 0x00, 0x00]` |
| `[0x00, 0xD7]` | `int16 big_endian` | `215` | `[0x00, 0xD7]` |
| `[0x00, 0x01]` | `bool` | `true` | `[0x00, 0x01]` |

---

### `base64`

Decodes a base64-encoded string to raw bytes. Encodes bytes back to a base64 string.

| | |
|---|---|
| Argument | any string (ignored) |
| Input | base64 `str` |
| Output | `bytes` |
| Reversible | yes |

```yaml
codecs:
  - base64: "standard"
```

**Decode / encode examples:**

| Raw value | Decoded | Encoded back |
|---|---|---|
| `"AAAA"` | `b'\x00\x00\x00'` | `"AAAA"` |
| `"QWxpYQ=="` | `b'Alia'` | `"QWxpYQ=="` |

---

### `byte_frame`

Decodes the byte immediately after a known prefix. Encodes by prepending the prefix to the value byte. Useful for proprietary binary protocols.

| | |
|---|---|
| Argument | hex prefix string (e.g. `"11 05 00 13"`) |
| Input | `bytes` |
| Output | `int` |
| Reversible | yes |

```yaml
codecs:
  - byte_frame: "11 05 00 13 00 55"
```

**Decode / encode examples (prefix `"11 05"`):**

| Raw bytes | Decoded | Encoded back |
|---|---|---|
| `b'\x11\x05\x03'` | `3` | `b'\x11\x05\x03'` |
| `b'\x11\x05\xFF'` | `255` | `b'\x11\x05\xFF'` |

---

### `slice`

Decodes a subsequence from bytes or a list using Python slice notation (0-indexed).

| | |
|---|---|
| Argument | `"start:end"` or `"start:end:step"` |
| Input | sequence (`bytes`, `list`) |
| Output | subsequence |
| Reversible | no |

```yaml
codecs:
  - slice: "0:4"
```

**Decode examples:**

| Raw value | Argument | Output |
|---|---|---|
| `b'\x41\xAC\x00\x00\xFF\xFF'` | `"0:4"` | `b'\x41\xAC\x00\x00'` |
| `[10, 20, 30, 40]` | `"1:3"` | `[20, 30]` |

---

### `knx_dpt`

Decodes a raw KNX wire value using a KNX Datapoint Type. Only applicable with `transport: knx`.

| | |
|---|---|
| Argument | DPT identifier — `"main.sub"` notation (e.g. `"9.001"`) |
| Input | `bool` (1-bit DPTs) or `list[int]` (multi-byte DPTs) |
| Output | typed value (`float`, `int`, `bool`, …) |
| Reversible | yes |

```yaml
codecs:
  - knx_dpt: "9.001"  # (e.g. "1.001", "20.102", "5.001")
```

**Decode / encode examples:**

| DPT | Input | Decoded | Encoded back |
|---|---|---|---|
| `1.001` | `true` | `true` | `true` |
| `9.001` | `[0x0F, 0xE8]` | `20.0` | `[0x0F, 0xE8]` |

---

### `mapping`

Decodes a device value by looking it up in a user-defined dictionary, and encodes back by reversing the lookup. Use when device values are raw codes (integers or short strings) that map to meaningful internal labels.

The mapping must be **bijective**: every internal value must be unique so the reverse lookup is unambiguous.

| | |
|---|---|
| Argument | dict of `device_value → internal_value` (e.g. `{1: "heat", 2: "cool"}`) |
| Input | any |
| Output | any |
| Reversible | yes |

```yaml
codecs:
  - mapping:
      1: "heat"
      2: "cool"
      3: "fan"
      4: "auto"
```

**Decode / encode examples:**

| Device value | Mapping | Decoded | Encoded back |
|---|---|---|---|
| `1` | `{1: "heat", 2: "cool", 3: "fan", 4: "auto"}` | `"heat"` | `1` |
| `3` | `{1: "heat", 2: "cool", 3: "fan", 4: "auto"}` | `"fan"` | `3` |

An unmapped value raises an error in both directions.

---

### `options`

Enforces that a value belongs to a predefined set of primitives. Decode passes any value through; encode rejects values not in the list with an error.

| | |
|---|---|
| Argument | list of allowed `str` or `int` values |
| Input | any |
| Output | same value (unchanged) |
| Reversible | yes |

```yaml
codecs:
  - options: ["heat", "cool", "fan", "auto"]
```

**Encode examples:**

| Value | Argument | Result |
|---|---|---|
| `"heat"` | `["heat", "cool", "fan", "auto"]` | `"heat"` — passes through |
| `"turbo"` | `["heat", "cool", "fan", "auto"]` | error — not in options |
| `1` | `[1, 2, 3]` | `1` — passes through |

> **Note:** `options` enforces only on write (encode). Reads always pass through — unexpected device values are surfaced as-is rather than silently rejected.

---

## Chaining

Multiple codecs can be declared on the same attribute. They run in the order they appear in the `codecs` list.

**On read (decode):** top-to-bottom — each codec's output becomes the next one's input.

**On write (encode):** bottom-to-top — encoders run in reverse order.

Non-reversible codecs are skipped on write (identity encoder).

**Integration example** — a single attribute with two chained codecs:

```yaml
- name: temperature
  data_type: float
  read_write: HR0
  codecs:
    - byte_convert: "int16 big_endian"
    - scale: 0.1
```

### Example — integer register with scaling

A device reports temperature as a signed 16-bit integer in tenths of a degree (`215` = 21.5 °C).

```yaml
codecs:
  - byte_convert: "int16 big_endian"  # step 1: registers → int
  - scale: 0.1                        # step 2: int → float (÷10)
```

| Direction | Steps | Result |
|---|---|---|
| Decode (read) | `[0x00, 0xD7]` → `215` (byte_convert) → `21.5` (scale) | `21.5` |
| Encode (write) | `21.5` → `215` (scale) → `[0x00, 0xD7]` (byte_convert) | `[0x00, 0xD7]` |

### Example — base64-encoded binary payload

A device returns a base64 string in a JSON response. The float value is packed at bytes 0–3.

```yaml
codecs:
  - json_pointer: /data                 # step 1: extract base64 string from JSON (non-reversible)
  - base64: "standard"                  # step 2: decode to bytes
  - slice: "0:4"                        # step 3: take first 4 bytes (non-reversible)
  - byte_convert: "float32 big_endian"  # step 4: bytes → float
```

| Direction | Steps | Note |
|---|---|---|
| Decode (read) | JSON → base64 str → bytes → 4-byte slice → float | full pipeline |
| Encode (write) | not applicable | `json_pointer` and `slice` are non-reversible — declare as read-only |
