# ADR 0006: Site operating rules on device writes

Status: accepted for AGR-1319 / AGR-1323 / AGR-1324 / AGR-1325.
Extends [ADR 0005](0005-declarative-write-validation.md).

## Ownership and scope

`packages/operating_rules` owns deployment-level operating rule configuration. A deployment
is the current site boundary; this does not introduce a Site, Tenant or equipment
group. Each rule explicitly targets one device, attribute and typed requested value
and requires a condition. Reciprocal interlocks are two independent rules.
Conditions only refuse writes; they never dispatch an action or stop equipment.

The API root and CLI instantiate the service and inject the shared
`OperatingRuleProvider` contract into devices. Devices never imports its implementation.
The owner receives a `PointInspector`; evaluation receives a `PointResolver`.
Adding a source requires code and root wiring, never a user plugin or executable
configuration. The service follows the repository start/stop lifecycle.

Only administrators may create, replace, enable/disable or delete operating rules
through the HTTP permission boundary. All roles may read them. Rules are enabled
by default; disabling preserves their definition for editing and later activation.
Activation revalidates the stored point contracts, definition and active-rule limit.
Disabling or deleting remains possible when references are broken.

`PATCH /operating-rules/{id}/enabled` and `DELETE /operating-rules/{id}?revision=N`
require the displayed revision. Every change records the authenticated actor and
server timestamp; stale mutations fail with 409. Deletion appends a tombstone:
list/get and enforcement exclude the rule, but `/history` retains all revisions.
Deleted rules cannot be reactivated. The legacy retirement endpoint remains
compatible; retired rules can be explicitly reactivated or deleted, with the old
retirement reason preserved in history. Rule activation is independent of
suspending an automation for maintenance.

Memory, the CLI file store and PostgreSQL implement the storage contract. Storage
owns migrations and connections; no database references cross service boundaries.
A complete snapshot is loaded before writes are accepted; initialization failure
aborts startup. Like the device registry, configuration has one running owner per
deployment. Independent API workers over one site do not provide distributed
enforcement. The CLI loads the current configuration for each invocation.

## Language and reference lifecycle

The existing grammar gains `{device_id: "pump-b", attribute: "running"}`.
No operators or truth values are duplicated. Driver-local `{attribute: "limit"}`
stays valid; driver import rejects external nodes with `external_device_reference`.
Site rules require explicit points. Shared type validation lives in models; the
existing Kleene evaluator receives a resolver. Existing depth, list and operation
budgets apply. Per-rule budgets chain to a device budget, including point checks;
at most 64 active rules may target an attribute.

Creation rejects missing points, non-writable targets and incompatible types. Saved rules retain point types. Missing
points or changed types later yield `operating_rule_reference_invalid`,
even in a branch that would short-circuit. List/get diagnostics expose missing
targets too. Target type drift blocks writes to that point until repaired, so the
old typed value cannot silently stop matching. Renames/deletions never silently
repair or remove site rules: an
administrator must explicitly repair them. Driver updates replace driver rules as
before and never replace site rules.

The legacy `change_event` dialect remains unchanged here. Migrating its stored
payloads belongs to AGR-1318/AGR-1320. This change supplies the cross-device expression
prerequisite without claiming the whole of AGR-1318 is complete.

## Freshness

Freshness is optional per operating rule and **disabled by default**. The nullable
`max_age_seconds` field sets a strictly positive, finite maximum observation age
for every point used by the condition. Missing/null means no age-based expiry,
including for older stored definitions. No driver acquisition cadence is required
when creating an operating rule, whether or not its freshness check is enabled.

Only acquired observations establish trust: reads, push reception and actual
readback. Persisted/default/requested values never do. Reception uses a monotonic
clock per point; receiving the same value renews its age. A write to that point,
failed read or device stop invalidates the observation without erasing displayed
history, even when freshness checking is disabled. Never-observed values are unknown.
Evaluation never reads the transport; enabling freshness does not schedule reads.

An operating rule with a duration treats a point as unknown when its age reaches that
limit. Another point's reception cannot renew it. Mapped values and every input
used to resolve them obey the same operating-rule-specific age limit. Different
operating rules may apply different durations to the same observations; evaluating a
shorter deadline must not invalidate data for another rule. Driver-rule expiry
and connection monitoring keep their own policies and do not impose a deadline
on site operating rules. Explicit observation failures still apply to all rules.

## Decisions and confirmation

Each targeted rule is allowed, `operating_rule_blocked`, or `operating_rule_unknown`.
Known prohibitions and broken references always beat acknowledgement. Independent
driver rules cannot be bypassed. Provider failure yields `operating_rule_unavailable`.

Unknown information refuses automatic and ordinary direct writes. Manual HTTP/UI
clients must preview, inspect the warning, and explicitly acknowledge it using the
preview token. Tokens bind user, destination, attribute, value, rule revisions and
unknown-rule IDs. They expire after the existing ten-minute preview window and
are consumed once. Unknown group members start unchecked.

Acknowledgement author, timestamp, rule IDs and binding are recorded in command
validation history before dispatch. Actual writes recheck under the device lock:
new rules, new unknowns and known prohibitions cannot reuse earlier consent.
Driver-authored UI confirmation metadata remains separate. CLI writes cannot
acknowledge unknown state and are refused.

Preview never writes, queues or reserves values. Group confirmation compares the
physical write contract and operating rule binding; editing, toggling, deleting or retiring rules requires
a new preview even if eligibility stays true. Every group member is checked again
at the universal write gate. OperatingRules do not depend on a presentation.

## Concurrency and execution confirmation

The target device lock covers checking, encoding and sending. It does **not** lock
other devices' observations. Concurrent starts guarded by separate running feedback
points may both read OFF and both be sent. A regression test exhibits this limit.
There is no cross-device mutual exclusion, reservation or hardware safety guarantee.
Panel/PLC/wiring actions outside the devices service are outside this boundary.

`CoreDevice` owns optional readback confirmation. Its existing five-second default
races push reception with active reads of the written attribute. Transport failures
and `ConfirmationError` remain distinct in command history. Disabling readback never
disables operating rules. Command-point readback is not proof of separate physical
running feedback: that feedback must be observed independently. Requested values
never become telemetry and cannot trigger a feedback-driven relay automation.
