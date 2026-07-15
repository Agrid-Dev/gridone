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
`polling_interval` instead. Every `polling_group` referenced by an attribute must be declared
in `polling_groups` — an undeclared reference is rejected when the driver is loaded.

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
