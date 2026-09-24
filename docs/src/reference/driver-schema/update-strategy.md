# Update Strategy

The [update strategy](../glossary.md#update-strategy) block controls how Gridone synchronizes its data with the actual, physical [device](../glossary.md#device). 
All fields are optional and omitting the block entirely uses the following defaults.

```yaml
update_strategy:
  polling_interval: 10s
  read_timeout: 10s
```

## Fields

| Field | Alias | Type | Default | Description |
|---|---|---|---|---|
| `polling_interval` | `polling` | duration or integer | `10` (seconds) | How often attributes are read from the device. Must be positive. |
| `read_timeout` | `timeout` | duration or integer or `null` | `10` (seconds) | Maximum time to wait for a device response. Must be between 1 and 60 seconds, or `null` to disable. |
| `polling_groups` | — | map of name to duration or integer | `{}` | Named polling groups, each with its own interval. See [Polling groups](#polling-groups). |

## Duration format

`polling_interval` and `read_timeout` accept either a plain integer (seconds) or a duration string:

| Unit | Accepted forms |
|---|---|
| Seconds | `s`, `sec`, `second`, `seconds` |
| Minutes | `m`, `min` |
| Hours | `h` |
| Days | `d` |

Examples: `30s`, `1min`, `2h`, `90` (= 90 seconds).

## Disabling polling

Set `polling: disable` to stop the system from polling the device. The device remains reachable for on-demand reads and writes, but no background polling occurs.
This can be especially useful for _push transport based devices_, like mqtt, knx, or lorawan, where devices spontaneously publish their attribute updates and don't require polling.

```yaml
update_strategy:
  polling: disable
```

`polling: disable` switches off the *default* polling only. Attributes assigned to a
[polling group](#polling-groups) keep polling on that group's schedule: assigning an
attribute to a named group is an explicit opt-in. This is how a push device gets a single
"trigger" attribute polled — a request the device answers with a burst of pushes carrying
every value — while its siblings stay listen-only:

```yaml
update_strategy:
  polling: disable
  polling_groups:
    full_refresh: 1min

attributes:
  - name: firmware_version
    polling_group: full_refresh   # the only polled attribute
    read:
      topic: data/${device_id}
      request: { topic: ${device_id}, message: READ_ALL }
    ...
  - name: temperature                # listen-only, fed by the burst
    read:
      topic: data/${device_id}
    ...
```

## Polling groups

Some devices expose many attributes that don't all need to be read at the same rate — a
temperature reading might be worth polling every 10 seconds, while a rarely-changing
configuration value only needs an hourly check. `polling_groups` declares named groups with
their own interval, and each attribute is assigned to one via its `polling_group` field:

```yaml
update_strategy:
  polling_groups:
    core: 10s
    realtime_other: 1min
    config: 1h

attributes:
  - name: temperature
    polling_group: core
    ...
  - name: fan_speed
    polling_group: realtime_other
    ...
  - name: temperature_setpoint_min
    polling_group: config
    ...
```

Each group polls on its own schedule, and all attributes in a group are read together in a
single batch request per sweep. Attributes with no `polling_group` fall back to the driver's
`polling_interval` instead, and stop polling altogether under `polling: disable` — named
groups do not (see [Disabling polling](#disabling-polling)). Every `polling_group` referenced
by an attribute must be declared in `polling_groups` — an undeclared reference is rejected
when the driver is loaded.

## Silence detection for push devices

Silence detection for push devices is now configured under the [health check](healthcheck.md) block via `expected_push_interval`.

## Examples

=== "Custom interval and timeout"

    ```yaml
    update_strategy:
      polling_interval: 1min
      read_timeout: 5s
    ```

=== "Polling disabled"

    ```yaml
    update_strategy:
      polling: disable
    ```


## Acquiring command dependencies

Write constraints, write rules, option conditions, value mappings and support
conditions read other attributes. Gridone trusts only values observed since the
device started syncing, so after a service restart, a driver change, a
transport reconnection or a device coming back online, it reads the inputs that
are not known instead of waiting for the next poll or push. Periodic polling
groups and their cadence are unchanged.

These reads are bounded, so that a trigger reaching a whole site never floods
it:

- per transport, 4 devices acquire at a time, and the others wait their turn;
- per device, 4 reads at a time: these reads are chosen by Gridone rather than
  grouped by the driver's author, and devices commonly queue only a handful of
  requests;
- inputs that share an address are read once.

Capability identities are read before conditional attributes. Each input is
read at most once per pass. A batch in which every read fails ends the pass, so
an absent device costs one batch: a single read timeout on transports that read
concurrently (MQTT, HTTP), one per address on those that read one at a time
(Modbus, BACnet, KNX, M-Bus). A read that answers never ends the pass, even when
its value stays unknown. Failures stay unknown: there is no automatic retry
loop and no write on an assumed value. A request that arrives during a pass (a
reconnection, say) adds exactly one more pass, which reads what is still missing
then. These reads do not count towards the device's connection status: an input
missing from a firmware version must not mark the device as degraded.

A reconnection keeps the observations that have a deadline (the expected push
interval, or two poll intervals plus the read timeout) until that deadline
lapses, and reads only what is missing. Observations without any deadline are
dropped and read again, since pushes lost during the outage would otherwise
never be caught up.
Push-only transports without an active read operation do not schedule these
reads. Stopping synchronization cancels the acquisition worker.

`POST /devices/{device_id}/attributes/{attr_name}/refresh` reads the attribute's
transitive dependencies, known or not, then the attribute itself. Someone is
waiting for it, so it does not queue behind the transport's other devices, but
it shares the device's limit of 4 reads at a time. The contextual **Refresh
data** action in the command controls calls this endpoint without sending a
command. `write_state.missing_attributes` identifies unresolved inputs; read
permissions filter these names in both REST and WebSocket responses.
