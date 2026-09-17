# ADR 0005 — Declarative write validation in drivers

- **Status**: Proposed (2026-09-16)
- **Issues**: AGR-1235 (implementation), AGR-1236 to AGR-1239 (sub-issues),
  AGR-1229 (project: AGRID thermostat business rules), AGR-1231 (preview and
  confirmation building blocks)

## Context

A driver could declare numeric `write_constraints` (step and bounds, possibly
read from a sibling attribute) and a presentation document could hide or block
face buttons. Nothing expressed "this option is available if…", a comparison
between two attributes, or a value whose meaning depends on the device's own
configuration.

The AGRID thermostat needs all three. Its firmware never refuses a write: it
clamps or repairs the value and answers OK, so the only place a wrong command
can be refused with a reason is before transport. Its writable `mode` is an
index into per-device `hvac_mode_0..9` slots, terminated by `HVAC_MODE_ERROR`,
so the same wire code means a different mode on each thermostat.

These decisions were taken while implementing AGR-1235 and reworked during its
review. They are the parts of the design worth keeping once the implementation
log is gone; the authoring contract itself is documented in
`docs/src/reference/driver-schema/command-validation.md`.

## Decision

### 1. The server is the only evaluator of eligibility

Rules (`write_rules`), option conditions (`write_options[].allowed_when`),
constraints and value tables share one bounded expression syntax over the
attributes of the same device. The server evaluates them for every write path
(HTTP, CLI, automations, grouped commands) and projects the result per
attribute as `write_state`. Clients render that projection; they never
re-derive eligibility.

Presentation conditions (`visible_when`, `blocked_when`, layout variants) keep
the document's binding syntax and are evaluated only by the client that renders
the document, like face visibility and colours: they decide what a page shows,
never whether a command is accepted. A control bound to an attribute follows
that attribute's `write_state`, so a restriction is declared once, as a rule,
and `blocked_when` is reserved for purely graphical blocking.

### 2. Freshness: the connection decides, not the age of a sample

A rule reads an attribute only while its last observation is trusted. Trust
comes from acquisition (poll, push, manual refresh, transport confirmation),
never from persisted telemetry, a default value or the value a write
requested. It ends when the device stops, when a read of that attribute fails,
when a command targeting the attribute is sent, and one
`expected_push_interval` after the last observation of a push device. An
untrusted value stays displayed; only its use in a rule stops.

### 3. Per-instance value tables above mono-value codecs

`value_mapping` resolves a wire code into a semantic value through entries that
may read sibling attributes, with `stop_value`, `selectable` and `duplicates`
semantics. It lives above the codec pipeline rather than inside the `mapping`
codec because codecs are pure functions of one wire value, built once per
driver: they have no device state, and giving them one would turn every codec
into a per-device object. The table keeps the raw code on the attribute so a
sibling change reinterprets it without a new sample.

### 4. The requested value is never telemetry

A write publishes nothing about the value it requested: the attribute keeps
its last observation until the device confirms or reports again, including for
`confirm: false` writes, which is how automations dispatch. The confirmed
timeseries point records the observed value. The command row is the record of
the request.

### 5. Refusals are terminal command rows

A refused submission is stored directly as a command in `error` with a
structured `validation` payload and the original submitted scalar; it never
reaches pending execution nor the transport. The 422 body carries the reasons
(`{code, message?}`), the messages being authored and localized by the driver.

### 6. One collaborator guards writes

`WriteGuard` (devices_manager) owns trust, expiry, rule evaluation, value
tables and the lazily computed `write_state` projection; `CoreDevice` stores
values and talks to transports. An observation costs O(1) plus the mapped
attributes that reference it; the projection runs once per event-loop turn, or
on the next read, and a device-wide operation budget bounds each pass.

## Consequences

- A rule that reads a sibling refuses writes until that sibling is observed:
  drivers must declare `expected_push_interval` realistically, and a restart
  refuses until the first acquisition.
- Automations see no optimistic value and no command-linked point; History >
  Commands is where their actions are audited.
- Two condition syntaxes coexist with distinct jobs; converging them is a
  separate decision (AGR-1236 flagged the risk of a third reference system).
- The commands migration adds nullable `validation` and `requested_value`
  columns; the `TEXT` `value` column stays, readable for legacy rows.
