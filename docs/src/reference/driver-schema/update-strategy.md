# Update Strategy

The `update_strategy` block controls how often the system polls a device's attributes. All fields are optional and omitting the block entirely uses the defaults.

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

```yaml
update_strategy:
  polling: disable
```

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
