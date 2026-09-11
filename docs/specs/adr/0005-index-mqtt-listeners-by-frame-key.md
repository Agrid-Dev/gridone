# ADR 0005 — Index MQTT listeners by frame key

- **Status**: Proposed — design recorded, implementation deferred (2026-09-11)
- **Issues**: AGR-1227 (per-listener frame match, #637), AGR-1217 (connection
  status recompute, #630), AGR-1219 (incremental connection health)

## Context

A push device declares one listener per attribute, and on MQTT they usually
share one topic. The Agrid thermostat is the extreme case: 257 attributes on
`updData/<mac>`. A full refresh arrives as 86 frames of three variables; an
ordinary push carries one.

Before #637 every frame went through every listener's codec. #637 added a
per-listener pre-filter: a read address may declare
`match: {contains: '"<Var>"'}`, and the MQTT transport only hands a frame to
the listeners whose match accepts it. The match is only a pre-filter in front
of the codec — a looser match costs a wasted decode, never a wrong value.

That is still O(listeners) per frame: every listener runs its own check. An
index — look up the listeners a frame concerns instead of asking each of them —
would make dispatch O(variables in the frame). This ADR records how, what it
would buy, and why it waits.

### What was measured

Dev laptop (Apple Silicon, Python 3.13), the production thermostat driver, one
full refresh in the firmware's own layout (the fixtures of
`test_mqtt_frame_match_perf.py`). Absolute numbers are higher on edge boxes;
the ratios are what matter.

**One check on a 443-byte frame** (the second column is what matters: 254 of
257 checks on a frame are rejections):

| check | frame carries the variable | frame doesn't |
|---|---|---|
| regex `"name"\s*:\s*"X"` | 402 ns | 540 ns |
| `contains '"X"'` (shipped) | 156 ns | 81 ns |

**Dispatching one frame to 257 listeners, real codecs, in-process:**

| strategy | µs / frame |
|---|---|
| no match (before #637) | 5 068 |
| per-listener `contains` (#637) | 101–112 |
| **keyed index (option B below)** | **53** |
| derived index (option C below) | 87 |

Of the 101 µs left by #637, about 48 µs are the 257 substring checks and about
45 µs are the three decodes that have to happen anyway (JSONPath filters,
~15 µs each). Iterating the listeners without doing anything costs 5 µs. So an
index saves **~50 µs per frame: ×2 on dispatch**. The "×85" figure is relative
to the no-match baseline, most of which #637 already captured (×45).

**End to end** (10 thermostats × 86 frames through a real broker): 7.2 s →
0.63 s with #637. The matched run is I/O-bound — under a profiler the top
entry is the event loop waiting on the socket — so an index would not move
this benchmark.

**The larger remaining cost is elsewhere.** After every loop turn that
appended to an attribute's event log, `CoreDevice._recompute_connection_status`
rebuilds a flat list of every log entry of every attribute
(`_collect_event_logs`) to derive the status. A frame is one turn, so this runs
once per frame. With 258 attributes holding 10 entries each — the steady state
of a device that has been running a while — it costs **464 µs per frame**:
about four times the whole dispatch, and about nine times what an index would
save. #630 removed the quadratic part (one rescan per listener append, ~135 ms
per frame) by folding a turn's appends into one rescan, and deliberately left
the rescan O(N) per frame for AGR-1219. The end-to-end benchmark does not
see it because its devices start with empty logs.

## Decision

Record option B as the design to implement when a trigger below is met; do not
implement it now. Make the connection-status recompute incremental first.

### Option B — keyed match, indexed per topic (chosen design)

A fourth match form names a key extracted from the frame and the value that
selects this listener:

```yaml
read:
  topic: updData/${mac}
  match:
    key:
      regex: '"name"\s*:\s*"([^"]+)"'   # one capture group: the frame's keys
      value: Tsetpoint
```

- **Semantics.** A frame is accepted when `value` is among the capture-group
  matches of `regex` in the raw payload. `accepts()` evaluates exactly that, so
  `_read` and unindexed paths keep one meaning; the index is only a faster way
  to evaluate it for many listeners at once.
- **Transport.** Per topic, the MQTT transport keeps
  `{extractor: {value: {listener ids}}}` next to a plain list of listeners
  without a keyed match. On a frame it runs each distinct extractor once
  (usually one per topic), unions the listener sets of the values found, then
  applies the plain list as today. Registration and unregistration maintain
  the index; it lives in a pure sibling module of `client.py`.
- **Driver.** Every attribute declares the same extractor and its own value,
  generated like the `contains` lines today. `contains` and the new form
  coexist; migrating the driver is a regeneration.

### What is explicitly rejected

- **Option C — derive the index from the `contains` needles, no new syntax.**
  Attractive because drivers would not change: the transport compiles a
  topic's needles into one alternation and scans the frame once. Measured at
  87 µs per frame — Python's `re` has no Aho–Corasick, and one scan across 257
  alternatives costs 31 µs by itself. Worth revisiting only with a native
  multi-pattern matcher (e.g. `pyahocorasick`), which adds a compiled
  dependency.
- **Parsing the frame once and sharing it between codecs.** `json.loads` is
  1.3 µs of a 15 µs decode; on a pre-parsed dict a JSONPath miss still costs
  13.7 µs. The filter evaluation dominates, not the parse.
- **Doing option B now.** ~50 µs per frame in-process, nothing measurable end
  to end, for a new syntax, index bookkeeping and a driver migration.

## Consequences

- Nothing changes for now; `contains` stays the recommended driver form.
- When implemented, dispatch becomes O(variables in the frame), and cost
  stops growing with attribute count.
- The price is a fourth match form, index bookkeeping in the MQTT transport
  (including `_read`'s short-lived listeners), and one more generated driver
  migration.

## Sequencing

1. **Make the connection-status recompute incremental (AGR-1219).** Keep
   per-attribute outcome counts, updated on append and eviction, instead of
   rebuilding the flat list per turn — now the largest per-frame cost.
2. **Re-profile a production box** once 0.237.0 and the `contains` driver are
   installed — ideally the largest thermostat fleet (~70 devices) across an
   hourly refresh window — to see what dominates in steady state.
3. **Implement option B when any trigger is met:**
   - a device type declares on the order of 1 000 listeners on one topic
     (per-listener checks alone reach ~100–300 µs per frame);
   - the per-listener `filtered` / `accepts` wrapper shows up among the top
     self-time entries of a production profile;
   - a box's frames per second × listeners per topic makes dispatch a visible
     share of event-loop time.

## Open questions

- **Key syntax.** A capture-group `regex` + `value` as above, or a JSONPath
  extractor (`$.data[*].name`) that would need a parse per frame (~1.3 µs,
  acceptable). The regex keeps the "no parse on the hot path" property.
- **Scope.** Only MQTT has many listeners on one topic today; KNX group
  addresses and webhook topics are already one listener per address.
