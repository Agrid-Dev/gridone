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
| `max_attribute_loss` | number in `[0, 1)` | `0` | Share of failed outcomes an attribute may show before the device is reported `unstable` (see [Tolerated loss](#tolerated-loss)). |

## Duration format

`expected_push_interval` accepts either a plain integer (seconds) or a duration string:

| Unit | Accepted forms |
|---|---|
| Seconds | `s`, `sec`, `second`, `seconds` |
| Minutes | `m`, `min` |
| Hours | `h` |
| Days | `d` |

Examples: `30s`, `1min`, `2h`, `90` (= 90 seconds).

## Connection status from read and listen outcomes

Gridone keeps the last 10 read outcomes and the last 10 listen outcomes of every attribute. An attribute's **loss** is the share of failures among the outcomes recorded in the worse of those two logs (they are not pooled: a failed poll adds a read error but no listen entry). `connection_status` is then:

| Condition | `connection_status` |
|---|---|
| No outcome recorded yet | `idle` |
| Every attribute with outcomes is at total loss | `error` |
| At least one attribute loses more than `max_attribute_loss`, or is at total loss | `unstable` |
| Otherwise | `ok` |

The loss is computed over the outcomes recorded so far, up to 10, so the status reacts from the first outcome rather than after a full window. Logs start empty whenever a device (re)starts: right after a restart, a first failed outcome is a total loss (`error`), one failure out of two is a 50 % loss, and so on until the log holds 10 outcomes.

### Tolerated loss

By default (`max_attribute_loss: 0`) any failure in an attribute's log reports the device `unstable` until it leaves the window, or `error` while the attribute has no successful outcome in its log. Devices on flaky links can tolerate occasional misses:

```yaml
healthcheck:
  expected_push_interval: 1h
  max_attribute_loss: 0.2
```

Once a log holds 10 outcomes, `0.2` keeps the device `ok` with up to 2 failures out of the last 10 and reports `unstable` from the third. Before that, the same share applies to fewer outcomes: 1 failure out of 5 is tolerated, 1 out of 4 is not. An attribute whose recorded outcomes all failed is never tolerated: it points at a wrong address or driver, or at a device that is down.

Changing `max_attribute_loss` on a live driver restarts its devices: their outcome logs start afresh and are judged against the new value, while the current `connection_status` is kept until the next outcome.

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
| ≥ 2× interval | `unstable` |
| ≥ 3× interval | `error` |

While the device is silent, the watchdog's status wins over read outcomes whenever it is worse: a failed poll cannot bring a silent device back from `error` to `unstable`. The first push message received hands the status back to read and listen outcomes.

The clock resets every time a push message is successfully received. On service restart it resets to the current time, giving the device one full grace period to re-emit before any escalation.

This field has no effect on pull devices. Pull devices track connection health through accumulated read outcomes.
