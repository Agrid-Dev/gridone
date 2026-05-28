# Bacnet Transport Client

BACnet is an object-oriented building-automation protocol. A datapoint isn't a
register or a topic — it's a **property** (usually `present-value`) of an
**object** (e.g. `analog-value 0`) that lives on a **device**. This client speaks
BACnet/IP (BACnet over UDP).

## Glossary

If you're new to BACnet, start here — these terms show up throughout the config.

| Term | What it means |
|------|---------------|
| **Object** | One datapoint on a device. Has a **type** and an **instance** number, e.g. `analog-value 0`. |
| **Object type** | The kind of datapoint. `analog-*` = a number, `binary-*` = on/off, `multi-state-*` = an enumerated state. `*-input` = read-only sensor reading; `*-value` = writable setpoint. Shorthands: `AI`, `AV`, `BI`, `BV`, `MI`, `MV`. |
| **Object instance** | Index of the object within its type, starting at 0 (`AV0`, `AV1`, …). |
| **Property** | An attribute of an object. We almost always read/write `present-value` (the live value). |
| **Device instance** | A device's numeric identity (its Device object's instance number, e.g. `1001`). Identifies *which device*, **not** how to reach it on the network. Set per device, not in the address. |
| **Who-Is / I-Am** | Discovery handshake. The client asks "who is out there?" (`Who-Is`); each device answers `I-Am` with its real network address. The client **binds** `device_instance → address` from that reply and routes all later reads/writes there. |
| **Broadcast vs directed** | A normal `Who-Is` is a LAN **broadcast** (every device hears it). A **directed** (unicast) `Who-Is` is sent to one IP — it crosses routers/NAT/Docker bridges that drop broadcasts. |
| **Router / gateway** | A box that bridges BACnet/IP to another segment, e.g. a serial **MS/TP** trunk (`serial→IP gateway`). Devices behind it are only reachable by their *routed* address, which you learn from `I-Am`. |
| **BBMD** | *BACnet Broadcast Management Device.* Forwards broadcasts across IP subnets. A client on another subnet registers with it as a **foreign device** to receive broadcasts. |
| **Foreign device** | A client that isn't on the BBMD's local subnet and registers with the BBMD (for `foreign_ttl` seconds) to participate in broadcast discovery — e.g. a NAT'd container. |
| **Write priority** | 1–16 (lower = higher precedence). A write only takes effect if no higher-priority slot commands the object. See [Priorities](#priorities). |

## Specificities of the current implementation

To interact with devices on a bacnet network, we need to create a *bacnet application* which acts itself as a device.

Only a single application can be used per ip/port. The application is created on `connect`, so make sure to close a client before creating a new one bound to the same ip/port.

### Discovery and addressing

Devices are discovered with `Who-Is` and **bound** to their address from the
`I-Am` reply, then read/written against that bound address. Binding is required:
a device behind a BACnet router/gateway only has a usable (routed) source
address once it has answered an `I-Am` — a manually built remote address has no
bound source and bacpypes3 rejects the reply.

The challenge is that `Who-Is` is a broadcast, which a Docker bridge does not
forward onto the physical LAN, so a containerized client discovered nothing. Two
config knobs make discovery work without `network_mode: host`:

- `discovery_address` — send a **directed (unicast) `Who-Is`** to this IP instead
  of a LAN broadcast. Crosses a Docker bridge fine; good for a directly
  addressable device or gateway.
- `bbmd_address` (+ `foreign_ttl`) — register as a **foreign device** with a
  BBMD. The BBMD then forwards broadcasts to us, so a normal `Who-Is` reaches the
  LAN (and devices behind a router) from a NAT'd/containerized client.

Other transport-config fields: `ip_with_mask` (local interface + mask, for the
bind and broadcast address), `port` (default 47808), `discovery_timeout`. The
device's `device_instance` stays in device config and keys the bound address.

Example driver `device_config`:

```yaml
device_config:
  - name: device_instance
```

## Configuration examples

A working setup has three parts:

1. a **transport** — how to reach the BACnet network (`BacnetTransportConfig`);
2. a **device** — supplies the `device_instance` to talk to;
3. a **driver** — maps device objects to attributes.

### Addressing syntax (in drivers)

A driver attribute points at an object via a short address string. All of these
are equivalent ways to write *analog-input 5*: `AI5`, `AI:5`, `AI 5`,
`analog-input:5`, `analog_input:5`. Append `P<n>` to set a write priority, e.g.
`AV0 P8`. The `device_instance` is **not** in the address — it comes from the
device config.

```yaml
# driver.yaml — maps objects to attributes (shared across all the setups below)
id: acme_rooftop_unit
transport: bacnet
device_config:
  - name: device_instance          # filled in per device (see below)
attributes:
  - name: room_temperature
    data_type: float
    read: AI0                      # analog-input 0  → read-only sensor
  - name: temperature_setpoint
    data_type: float
    read_write: AV0                # analog-value 0  → writable setpoint
  - name: occupancy
    data_type: bool
    read_write: BV0                # binary-value 0
  - name: fan_mode
    data_type: int
    read_write: MV0                # multi-state-value 0
  - name: operator_override
    data_type: float
    read_write: AV0 P8             # write at priority 8 (operator override)
```

```yaml
# device — which device on the network this driver instance talks to
device:
  name: Rooftop Unit 1
  config:
    device_instance: 1001          # the device's Device-object instance number
```

The transport `config` is what changes between deployments:

#### A. Flat LAN — broadcast discovery (simplest)

The client shares the same layer-2 network as the devices (e.g. host
networking), so a broadcast `Who-Is` reaches everyone.

```yaml
transport:
  name: site-bacnet
  protocol: bacnet
  config:
    ip_with_mask: 192.168.1.50/24  # the client's own NIC address + subnet mask
    port: 47808                    # BACnet/IP default (0xBAC0)
```

#### B. Known device or gateway IP — directed Who-Is (containers, routed networks)

You know the IP of the device (or of the serial→IP gateway in front of it), but
a broadcast won't reach it (Docker bridge, different subnet…). Send a directed
`Who-Is` to that IP; the gateway relays it and the device's routed address gets
bound. **This is the answer to "device behind a serial→IP gateway, known IP +
device_instance":** point `discovery_address` at the gateway.

```yaml
transport:
  name: site-bacnet
  protocol: bacnet
  config:
    ip_with_mask: 192.168.1.50/32     # /32 → bind only, no broadcast socket
    discovery_address: 192.168.1.200  # the device or serial→IP gateway IP
    port: 47808
```

#### C. Devices behind a BBMD / router — foreign-device registration

The client is on a different subnet (or NAT'd) from a BBMD/router that fronts the
devices (e.g. a Carrier NSM). Register as a foreign device so broadcasts reach
the client and the devices behind the router.

```yaml
transport:
  name: site-bacnet
  protocol: bacnet
  config:
    ip_with_mask: 192.168.1.50/24
    bbmd_address: 10.0.0.1            # BBMD/router IP to register with
    foreign_ttl: 900                  # re-registration lifetime, seconds
    port: 47808
```

## Priorities

Bacnet write property requests have a priority level 1-16 (lower values have higher priority). Writing properties will have no effect if overridden by a higher property rule.

Bacnet priorities range as follows:

| Priority Range | Description |
|----------------|-----------------------------------------------------------------------------|
| 1–2            | Life safety (fire, smoke, emergency shutdown) → don’t touch.               |
| 3–4            | Critical / manual overrides at the plant or local controller.               |
| 5–6            | Protective limits (freeze protection, high limit, etc.).                    |
| 7–8            | Operator overrides / automatic control from a BMS.                           |
| 9–15           | Lower-importance automation, optimization, “nice to have”.                  |
| 16             | Lowest priority (often used for “normal” default commands).                |

Bacnet write priorities allowed in bacnet addresses for this client are 5 to 16 (no life safety or critical priority overridding).
