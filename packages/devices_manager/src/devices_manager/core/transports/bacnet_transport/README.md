# Bacnet Transport Client

Bacnet is an object oriented transport protocols.

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
