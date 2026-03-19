# Value Adapters

Value adapters **decode** the raw value exchanged with a device into the internal typed value Gridone works with — and **encode** it back for writing.

They are declared as keys directly on an attribute, alongside `read`/`write`. Each key is the adapter's identifier and its value is the argument:

```yaml
- name: temperature
  data_type: float
  read_write: HR0:2
  byte_convert: "float32 big_endian"  # key: byte_convert, argument: "float32 big_endian"
```

---

## Reversible vs non-reversible

An adapter is **reversible** if it implements both directions: **decode** (transport → Gridone) on read, and **encode** (Gridone → transport) on write. Both are applied automatically.

A **non-reversible** adapter only implements decode. It is skipped on write (falls back to identity) — meaning it should not be used on writable attributes where the write path depends on that transformation.

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

Decodes a value from a JSON object or string using an [RFC 6901](https://datatracker.ietf.org/doc/html/rfc6901) pointer. Typically used with HTTP and MQTT responses.

| | |
|---|---|
| Argument | JSON pointer path (e.g. `/data/temperature`) |
| Input | `dict`, JSON string, or bytes |
| Output | any |
| Reversible | no |

```yaml
json_pointer: /data/temperature
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
json_path: "$.sensors[0].temperature"
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
scale: 0.1
```

**Decode / encode examples:**

| Raw value | Argument | Decoded | Encoded back |
|---|---|---|---|
| `215` | `0.1` | `21.5` | `215` |
| `1000` | `0.01` | `10.0` | `1000` |
| `72` | `0.5` | `36.0` | `72` |

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
bool_format: "0/1"
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
byte_convert: "float32 big_endian"
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
base64: "standard"
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
byte_frame: "11 05 00 13 00 55"
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
slice: "0:4"
```

**Decode examples:**

| Raw value | Argument | Output |
|---|---|---|
| `b'\x41\xAC\x00\x00\xFF\xFF'` | `"0:4"` | `b'\x41\xAC\x00\x00'` |
| `[10, 20, 30, 40]` | `"1:3"` | `[20, 30]` |

---

## Chaining

Multiple adapters can be declared on the same attribute. They run in the order they appear in the YAML.

**On read (decode):** top-to-bottom — each adapter's output becomes the next one's input.

**On write (encode):** bottom-to-top — encoders run in reverse order.

Non-reversible adapters are skipped on write (identity encoder).

**Integration example** — a single attribute with two chained adapters:

```yaml
- name: temperature
  data_type: float
  read_write: HR0
  byte_convert: "int16 big_endian"
  scale: 0.1
```

### Example — integer register with scaling

A device reports temperature as a signed 16-bit integer in tenths of a degree (`215` = 21.5 °C).

```yaml
byte_convert: "int16 big_endian"  # step 1: registers → int
scale: 0.1                        # step 2: int → float (÷10)
```

| Direction | Steps | Result |
|---|---|---|
| Decode (read) | `[0x00, 0xD7]` → `215` (byte_convert) → `21.5` (scale) | `21.5` |
| Encode (write) | `21.5` → `215` (scale) → `[0x00, 0xD7]` (byte_convert) | `[0x00, 0xD7]` |

### Example — base64-encoded binary payload

A device returns a base64 string in a JSON response. The float value is packed at bytes 0–3.

```yaml
json_pointer: /data                 # step 1: extract base64 string from JSON (non-reversible)
base64: "standard"                  # step 2: decode to bytes
slice: "0:4"                        # step 3: take first 4 bytes (non-reversible)
byte_convert: "float32 big_endian"  # step 4: bytes → float
```

| Direction | Steps | Note |
|---|---|---|
| Decode (read) | JSON → base64 str → bytes → 4-byte slice → float | full pipeline |
| Encode (write) | not applicable | `json_pointer` and `slice` are non-reversible — declare as read-only |
