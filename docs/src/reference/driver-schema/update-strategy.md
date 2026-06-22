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
| `expected_push_interval` | `expected_push` | duration or integer or `null` | `null` | Expected interval between push emissions. When set alongside `polling: disable`, enables silence detection (see below). |

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

## Silence detection for push devices

When a push device stops emitting data, there is no failed poll to detect it. Setting `expected_push_interval` alongside `polling: disable` enables a watchdog that monitors the time since the last received push and updates `connection_status` automatically.

```yaml
update_strategy:
  polling: disable
  expected_push_interval: 30s
```

The watchdog escalates `connection_status` based on how long the device has been silent relative to the declared interval:

| Silence duration | `connection_status` |
|---|---|
| < 2× interval | `ok` (within grace period) |
| ≥ 2× interval | `degraded` |
| ≥ 3× interval | `error` |

The clock resets every time a push message is successfully received. On service restart it resets to the current time, giving the device one full grace period to re-emit before any escalation.

This field has no effect on pull devices. Pull devices track connection health through accumulated read outcomes.

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
