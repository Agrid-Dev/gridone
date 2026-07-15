# Health Check

The [health check](../glossary.md#health-check) block controls how Gridone assesses whether a [device](../glossary.md#device) is still alive. It is orthogonal to the [update strategy](update-strategy.md): update strategy governs how attributes are fetched, health check governs whether the device is considered reachable.

```yaml
healthcheck:
  expected_push_interval: 30s
```

## Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `expected_push_interval` | duration or integer or `null` | `null` | Expected interval between push emissions. When set, enables silence detection (see below). |

## Duration format

`expected_push_interval` accepts either a plain integer (seconds) or a duration string:

| Unit | Accepted forms |
|---|---|
| Seconds | `s`, `sec`, `second`, `seconds` |
| Minutes | `m`, `min` |
| Hours | `h` |
| Days | `d` |

Examples: `30s`, `1min`, `2h`, `90` (= 90 seconds).

## Silence detection for push devices

When a push device stops emitting data, there is no failed poll to detect it. Setting `expected_push_interval` enables a watchdog that monitors the time since the last received push and updates `connection_status` automatically.

```yaml
healthcheck:
  expected_push_interval: 30s

update_strategy:
  polling: disable
```

The watchdog escalates `connection_status` based on how long the device has been silent relative to the declared interval:

| Silence duration | `connection_status` |
|---|---|
| < 2× interval | `ok` (within grace period) |
| ≥ 2× interval | `degraded` |
| ≥ 3× interval | `error` |

The clock resets every time a push message is successfully received. On service restart it resets to the current time, giving the device one full grace period to re-emit before any escalation.

This field has no effect on pull devices. Pull devices track connection health through accumulated read outcomes.

## Migrating from `update_strategy.expected_push_interval`

`expected_push_interval` under `update_strategy` is deprecated. Drivers that still declare it there keep working — Gridone falls back to it and logs a deprecation warning — but new and updated drivers should declare it under `healthcheck` instead.
