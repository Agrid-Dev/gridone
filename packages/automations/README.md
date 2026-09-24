# gridone-automations

Automations select one action from an ordered decision tree. Trigger providers
deliver events; action providers perform effects through the ordinary application
services. The automations package has no knowledge of devices or command storage.

## Decision trees and compatibility

An automation has one trigger and an ordered tree with 1 to 64 branches in total,
up to 16 levels deep. Each branch has a stable ID, an optional name, a condition,
and either a terminal `action` or nested `branches` (never both). A missing condition
means unconditional. At each level, the first match selects an action or enters
its subtree. A matched subtree owns the rest of the selection: no child match means
no action, without returning to an ancestor fallback. An unknown condition also
stops the entire selection. A failed action does not fall through. If nothing matches, history records `no_match`
without sending a notification.

Conditions use the shared expression language in `models.expressions`: Boolean
groups, comparisons, arithmetic, `is_known`, explicit device/attribute references,
and event references. Unknown conditions stop selection with `condition_unknown`;
they never silently select a fallback. Invalid attribute references also stop selection,
including references hidden behind a short-circuited operand. `max_age_seconds`
optionally bounds the freshness of referenced observations. References are resolved
from an in-memory snapshot, once per attribute per selection. Shared expression limits
bound depth, each branch, and the complete tree.

The SQL migration converts every existing action to one unconditional branch, drops
the `action` column, and preserves the trigger, enabled state, and metadata. There
is one execution path and one API shape: `branches`, on create, update and in
responses. Branch order and IDs survive saves. Legacy trigger filters retain their
existing comparison semantics; branch conditions use the shared, typed expression
language.

The UI keeps the existing single-action form and offers expansion into a tree.
Use **Add a decision** on an action branch to insert another decision before the
existing action; this preserves the parent condition and the action. Then use
**Add a child branch** for alternatives at that level. Branch numbers such as 1.2
show the path, which is also recorded in execution history. The tree displays
conditions, actions, order, early termination, and unmatched events. Conditions use
the shared expression editor; inline write values are static.

## Events and writes

`TriggerContext` contains `timestamp`, `device_id`, `attribute`, `previous_value`,
`value`, `has_previous`, and `is_initial`. Expressions can read these fields with,
for example, `{"event": "value"}` or `{"event": "has_previous"}`. A missing previous
observation is distinct from a real transition. Scheduled triggers have no device
context. All action providers now accept `execute(params, context)`; command
templates and notifications retain their existing behavior.

The command action has two shapes: a saved `template_id`, or one inline write with
`attribute`, a static `value` and an optional `device_id` (the event's device when
omitted). An inline write resolves the target's declared data type and uses the
command service without retries or consent bypass. Equipment protections remain
authoritative. Refused writes are visible in command history and the automation
execution log. A failed write does not try another branch. Equipment-specific
conditions and recovery after a fault must be declared explicitly in automations.

At startup, reconnect, or recovery after an attribute read error, the first observation
establishes a baseline without executing an action, even when a restored value
differs. A changed initial observation appears as `initialized` in history. An
unchanged first observation produces no change event. Subsequent changes trigger
normally. The device passes that fact to every attribute listener as an explicit
`initial` argument, next to the live attribute and its `previous` snapshot.

The change-event provider owns one fleet subscription and indexes its listeners by
`(device_id, attribute)`. Each update invokes only matching listeners, not all
automations. The dispatch-count regression test registers 100 automations and
verifies one upstream subscription and one matching listener invocation for one
attribute update. Subscription lookup is O(1); dispatch work is O(matching automations).
This measures callback fan-out, not an end-to-end latency guarantee.

## Deactivation and execution safeguards

There is one state, `enabled`, and it applies to the whole automation.
`POST /automations/{id}/disable` takes an optional `reason`; the server records it
with the authenticated actor, the time and the source as the automation's
`deactivation`, which persists, survives restart, and does not affect equipment
protections. `POST /automations/{id}/enable` resumes listening, clears the trace and
the runtime counters, and neither issues a command nor replays missed events.
`PATCH` does not carry `enabled`: a state change is always one of these two routes,
so it is always traced. The trace describes the current stop, not an audit journal
of past operator changes.

The circuit breaker disables the automation the same way, with source
`circuit_breaker`, the system actor and the guard's code as the reason; the execution
that tripped it is recorded as `tripped`. Re-enabling is manual. Defaults,
configurable in `guardrails`, are:

| Guard | Default behavior |
| --- | --- |
| Execution rate | At most 10 selected actions in a rolling 60 seconds; the next match trips the breaker before dispatch. |
| Consecutive failures | Trip after 3 failed evaluations/actions. A nonfailed selection resets the failure count. |
| Overlap | A second event during an execution is recorded as `skipped` (`overlapping_execution`) and not dispatched; the automation stays enabled. |
| Direct feedback | A write to the event's own point trips the breaker before dispatch: the service checks every provider's `describe_writes` once, inline writes and templates with explicit device IDs alike. |

No-match and initial observations do not consume the action-rate allowance. A trip
prevents future dispatches; it cannot recall a command already in flight. Counters
are process-local; a persisted deactivation survives restart.

`GET /automations/{id}/diagnostics` provides advisory warnings for direct feedback
and opposing static writes to the same attribute by another enabled automation.
Providers expose `describe_writes(params, trigger)` for this analysis and for the
direct-feedback check. Inline writes and explicit command-template IDs are supported. Conditions may be mutually
exclusive, so a warning is not proof of a conflict.

Detection does **not** prove that a complete plant is free of feedback cycles.
Dynamically resolved template groups, computed write values, physical equipment
responses, and slow indirect cycles may not be statically diagnosed. Rapid indirect
cycles are bounded by per-automation execution limits; a real two-device loop is
covered by an integration test. Thresholds should match the intended operating
cadence. The circuit breaker is an execution safeguard, not an equipment safety
invariant or a replacement for write protections.

## Deployment and persistence

The service keeps a complete in-memory cache and owns its trigger registrations.
Run one automation service process per database. Multiple workers would duplicate
listeners and independently count executions; this implementation does not provide
distributed coordination.

Migration `0006` adds branches, deactivation, guardrails, freshness, and execution
context/trace columns, and replaces the `action` column with the first branch. Its
rollback refuses trees that cannot be represented by the old schema, rebuilds
`action` from the single branch and drops deactivation traces (the disabled state is
kept). Before deploying an older binary, also remove actions/providers unsupported
by that binary.

Validation covers legacy-row migration on PostgreSQL, ordered evaluation, unknown
references, event initialization, deactivation persistence, protected command
refusal, and a real indirect feedback loop. UI tests cover order, editing,
validation, and the operator's enable/disable controls.
