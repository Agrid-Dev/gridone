# OPC-UA transport spec

- **Status**: Draft
- **Milestone**: M1 — Pull
- **Issues**: AGR-981 (this spec), AGR-983 (address/config), AGR-984 (pull client), AGR-982/985 (acceptance)
- **Out of scope**: certificate/Sign&Encrypt security (M3, AGR-991/992), subscriptions beyond the placeholder below (M2, AGR-987/988/989)

## Decisions

1. `OpcuaAddress` follows the `BacnetAddress` shape (`BaseModel` + `TransportAddress`), but needs no `extra_context` — an OPC-UA NodeId is self-contained, unlike a Bacnet object which needs a device instance.
2. Auth for M1 is `anonymous` or plain `username_password`. Secret storage hardening is explicitly deferred to AGR-992 — do not attempt it here.
3. Codec policy is **identity-first**: most values arrive already typed via `asyncua`, so no new codec family. ExtensionObjects decode to a `dict` in the transport and are addressed with the existing `json_pointer` codec; everything else falls through to `scale`/`offset`/`mapping`/`options` as needed. An attribute's final value is always a scalar (`int | float | str | bool`) — a dict must be reduced via `json_pointer` before it reaches the attribute layer, it is never exposed raw.
4. Write-side exact variant typing (e.g. server wants `Int16` not `Int32`) is resolved in the transport's write path, not in a codec — only the transport has the server-declared type.

## `OpcuaAddress`

NodeId, in the protocol's own string notation.

| Field | Type | Description |
|---|---|---|
| `namespace_index` | `int` (`ns`) | Namespace index, e.g. `2` |
| `identifier_type` | `"i" \| "s" \| "g" \| "b"` | Numeric / String / GUID / Opaque |
| `identifier` | `int \| str` | The identifier itself |

**String form** — `ns=<index>;<type>=<value>`:

```yaml
read: "ns=2;s=Chiller.SupplyTemp"   # string identifier
read: "ns=4;i=1042"                 # numeric identifier
read: "ns=1;g=09087e75-8e5e-499b-954f-f2a9603db28a"  # GUID
read: "ns=1;b=M/RbKBsRVkePCePcx24oRA=="               # opaque, base64
```

**Dict form** — equivalent, explicit:

```yaml
read:
  ns: 2
  s: Chiller.SupplyTemp
```

`OpcuaAddress.id` returns the canonical `ns=..;t=..` string — this is both the value fed to `asyncua`'s `NodeId.from_string()` and (M2) the MonitoredItem topic.

## Transport config

| Field | Required | Default | Description |
|---|---|---|---|
| `endpoint_url` | yes | — | `opc.tcp://host:port/path` |
| `auth_mode` | no | `anonymous` | `anonymous` or `username_password` |
| `username` | no | — | Required if `auth_mode` is `username_password` |
| `password` | no | — | Required if `auth_mode` is `username_password` (plain for M1, see AGR-992) |
| `connect_timeout` | no | `10.0` | Seconds to establish the session |
| `request_timeout` | no | `5.0` | Seconds per Read/Write service call |
| `keepalive_interval` | no | `5.0` | Seconds between session keepalive pings |

```yaml
transport:
  name: chiller-opcua
  protocol: opcua
  config:
    endpoint_url: opc.tcp://10.0.1.20:4840
    auth_mode: anonymous
```

## Codec policy

```mermaid
flowchart LR
    A["OpcuaAddress"] --> R["asyncua Read service"]
    R --> V{"Variant type?"}
    V -->|scalar / array| C1["existing codecs\nscale · offset · mapping · options"]
    V -->|ExtensionObject| C2["decode to dict\n(in transport)"] --> C3["json_pointer codec"]
    C1 --> D["attribute value"]
    C3 --> D
```

Decode runs top-to-bottom on read, bottom-to-top on write, same as every other transport. `json_pointer`/`bit`/`slice` stay identity on encode — no change from existing behavior.

```yaml
attributes:
  - name: supply_temperature
    data_type: float
    read: "ns=2;s=Chiller.SupplyTemp"

  - name: setpoint
    data_type: float
    read_write: "ns=2;s=Chiller.Setpoint"

  - name: compressor_status
    data_type: str
    read: "ns=4;i=1042"          # ExtensionObject
    codecs:
      - json_pointer: /status/code
```

## Test strategy

| Harness | Level | Covers |
|---|---|---|
| In-process `asyncua` server (pytest fixture) | Integration (AGR-984) | Real protocol round-trips for every scalar/array data type, both NodeId forms, against a controlled fixture — fast loop, no external deps |
| `opc-plc` Docker (`mcr.microsoft.com/iotedge/opc-plc`) | Acceptance (AGR-982) | End-to-end golden path through the API, deterministic node set, mirrors the existing http/modbus acceptance legs |
