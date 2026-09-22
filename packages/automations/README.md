# gridone-automations

Automations select one action from an ordered decision tree. Trigger providers
deliver events; action providers perform effects through the ordinary application
services. The automations package has no knowledge of devices or command storage.

## Decision trees and compatibility

An automation has one trigger and between 1 and 64 ordered `branches`. Each branch
has a stable ID, an optional name, a condition, and an action. A missing condition
means unconditional. Evaluation stops at the first match; a failed action does not
fall through to the next branch. If nothing matches, history records `no_match`
without sending a notification.

Conditions use the shared expression language in `models.expressions`: Boolean
groups, comparisons, arithmetic, `is_known`, explicit device/attribute references,
and event references. Unknown conditions stop selection with `condition_unknown`;
they never silently select a fallback. Invalid point references also stop selection,
including references hidden behind a short-circuited operand. `max_age_seconds`
optionally bounds the freshness of referenced observations. References are resolved
from an in-memory snapshot, once per point per selection. Shared expression limits
bound depth, each branch, and the complete tree.

The SQL migration converts every existing action to one unconditional branch and
preserves its trigger, enabled state, and metadata. There is one execution path.
Legacy create payloads containing `action` remain accepted, and responses retain
`action` as a compatibility mirror of the first branch. A legacy action update can
only modify a single-branch automation; it cannot overwrite a multi-branch tree.
New clients should submit `branches`. Branch order and IDs survive saves. Legacy
trigger filters retain their existing comparison semantics; the new branch
conditions use the shared, typed expression language.

The UI keeps the existing single-action form and offers expansion into a tree.
The tree displays conditions, actions, order, early termination, and unmatched
events. Conditions and direct-write values use the shared expression editor.

## Events and writes

`TriggerContext` contains `timestamp`, `device_id`, `attribute`, `previous_value`,
`value`, `has_previous`, and `is_initial`. Expressions can read these fields with,
for example, `{"event": "value"}` or `{"event": "has_previous"}`. A missing previous
observation is distinct from a real transition. Scheduled triggers have no device
context. All action providers now accept `execute(params, context)`; command
templates and notifications retain their existing behavior.

The `write_attribute` action accepts an explicit `device_id` (or `null` for the
event's device), `attribute`, and a shared value expression. It resolves the target's
declared data type and uses the command service without retries or consent bypass.
Equipment protections remain authoritative. Refused writes are visible in command
history and the automation execution log. A failed write does not try another
branch. Equipment-specific conditions and recovery after a fault must be declared
explicitly in automations.

At startup, reconnect, or recovery after a point read error, the first observation
establishes a baseline without executing an action, even when a restored value
differs. A changed initial observation appears as `initialized` in history. An
unchanged first observation produces no change event. Subsequent changes trigger
normally. Event payloads are copied before asynchronous listener delivery so a later
reading cannot change an already queued event.

The change-event provider owns one fleet subscription and indexes its listeners by
`(device_id, attribute)`. Each update invokes only matching listeners, not all
automations. The dispatch-count regression test registers 100 automations and
verifies one upstream subscription and one matching listener invocation for one
point update. Subscription lookup is O(1); dispatch work is O(matching automations).
This measures callback fan-out, not an end-to-end latency guarantee.

## Suspension and execution safeguards

Suspension applies to the whole automation. `POST /automations/{id}/suspend` accepts
a nonblank `reason`; the server records the authenticated actor, time, and source.
It persists indefinitely, survives restart, and does not affect equipment
protections. `POST /automations/{id}/enable` explicitly resumes listening, clears
the active suspension and runtime counters, and does not issue a command or replay
missed events. Patching `enabled` cannot resume a suspended automation. Legacy
disable remains available; the UI uses reasoned suspension. The suspension fields
describe the active suspension, not an audit journal of past operator changes.

The circuit breaker also suspends the whole automation, with source
`circuit_breaker`, the system actor, and a visible reason. Rearming is manual.
Defaults, configurable in `guardrails`, are:

| Guard | Default behavior |
| --- | --- |
| Execution rate | At most 10 selected actions in a rolling 60 seconds; the next match suspends before dispatch. |
| Consecutive failures | Suspend after 3 failed evaluations/actions. A nonfailed selection resets the failure count. |
| Overlap | A new event during an execution suspends the automation and does not dispatch a second action. |
| Direct feedback | A write to the event's own point suspends before dispatch. Explicit command-template device IDs are checked too. |

No-match and initial observations do not consume the action-rate allowance. A
suspension prevents future dispatches; it cannot recall a command already in flight.
Counters are process-local; an already persisted suspension survives restart.

`GET /automations/{id}/diagnostics` provides advisory warnings for direct feedback
and opposing static writes to the same point by another enabled automation.
Providers expose `describe_writes(params, trigger)` for this analysis. Direct writes
and explicit command-template IDs are supported. Conditions may be mutually
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

Migration `0006` adds branches, suspension, guardrails, freshness, and execution
context/trace columns while retaining legacy action data. Its rollback refuses
trees or active suspensions that cannot be represented by the old schema. Before
deploying an older binary, also remove actions/providers unsupported by that binary.

Validation covers legacy-row migration on PostgreSQL, ordered evaluation, unknown
references, event initialization, suspension persistence, protected command refusal,
and a real indirect feedback loop. UI tests cover order, editing, validation, and
operator suspension controls.
