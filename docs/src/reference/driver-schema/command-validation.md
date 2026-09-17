# Declarative command validation

Drivers can declare command rules independently of protocols and UI layouts. The
server evaluates them for every write: HTTP, CLI, automation and grouped command.
A driver contains data only; expressions cannot execute code or read another device.

## Attribute contract

```yaml
- name: setpoint
  data_type: float
  read: GET /setpoint
  write: POST /setpoint
  default_value: 22
  write_constraints:
    minimum: {attribute: minimum}
    maximum:
      op: subtract
      args: [{attribute: maximum}, 1]
    step: 0.5
    sentinels: [0]
  write_rules:
    - condition:
        op: eq
        left: {attribute: locked}
        right: false
      reason:
        code: locked
        message:
          default: Controls are locked
          translations: {fr: Les commandes sont verrouillées}
```

`default_value` is an input suggestion. It never initializes reported telemetry or
satisfies a dependency. A statically incompatible default fails driver validation.
The attributes referenced in this example must also be declared by the driver.

`write_constraints` supports numeric literals and expressions for `minimum`,
`maximum` and `step`. Steps are positive and anchored at zero. A sentinel bypasses
numeric bounds and step checks, but still passes all option and command rules.

`write_options` is an ordered finite list of `{value, allowed_when?, reason?}`.
Unavailable choices remain in the server projection with their reasons. Options
inferred from ordinary codecs remain supported. A current value outside this list
is still reported faithfully.

Rules have `effect: require` (default) or `effect: warn`. A required condition must
be true. A warning is announced when its condition is true or unknown. Reasons
use a stable snake-case `code` and optional localized `message`.

## Expressions and missing observations

Operands are scalar literals, `{attribute: sibling}`, or `{candidate: true}`.
Candidates are allowed inside write rules and option conditions. They do not
replace the observed value of the target attribute.

| Kind | Shape |
| --- | --- |
| Comparison | `{op: eq|lt|lte|gt|gte, left: expression, right: expression}` |
| Membership | `{op: in, value: expression, values: [scalar, ...]}` |
| Knowledge | `{op: is_known, value: expression}` |
| Negation | `{op: not, condition: condition}` |
| Junction | `{op: all|any, conditions: [condition, ...]}` |
| Arithmetic | `{op: add|subtract|min|max, args: [expression, expression, ...]}` |
| Choice | `{op: if, condition: condition, then: expression, otherwise: expression}` |

A missing dependency produces **unknown**. `all(false, unknown)` is false and
`any(true, unknown)` is true. A conditional evaluates only its selected branch;
unknown never chooses a fallback branch. Booleans are distinct from numbers.
Import validates operand types, local references and mapping calculation cycles.
Renaming a referenced attribute rewrites these declarations; deleting one is blocked.

Evaluation performs **no transport reads**. Normal polling, push messages, manual
refreshes and transport confirmation acquire observations. Persisted telemetry is
shown after restart but is not trusted until observed again. Stopping acquisition
invalidates knowledge, and an explicit failed read invalidates its attribute context. With `healthcheck.expected_push_interval`, knowledge expires
at one expected interval after the last acquired observation, independently of health degradation
thresholds. A manual refresh renews this command-knowledge window without resetting push health. A sample at 10:00 with a one-hour interval expires at 11:00.

The check, the encoding and the send of a write run under one per-device lock, so
no concurrent write moves the context between them; confirmations wait outside it,
and a value table that moved meanwhile is reported as `mapping_changed`. Sending a
command invalidates knowledge of its target until a new observation arrives. The
requested value is never published as telemetry, including when `confirm: false`
is used: automations send unconfirmed writes, so their command rows record the
request and the device keeps its last observation until it is polled or pushes
again.

## Instance-specific value mappings

A `value_mapping` transforms the result of the ordinary codec pipeline. Each device
resolves the table from its own observations; codecs themselves remain mono-value.

```yaml
value_mapping:
  duplicates: reject
  stop_value: END
  entries:
    - {code: 0, value: reserved, selectable: false}
    - {code: 1, value: {attribute: mode_1}}
    - {code: 2, value: {attribute: mode_2}}
```

The codec decodes a wire value to `code`; the table then resolves its semantic value.
Writing performs the inverse before codec encoding. Reserved codes remain readable.
`stop_value` terminates selectable entries. Duplicate semantic values are rejected
unless `duplicates: first` explicitly selects the first match. Unknown entries that
could change that decision prevent encoding. Unknown raw codes and unresolved table
values retain `raw_value` and expose `resolution_error`.

A table update reinterprets the saved intermediate code, even without another sample
of the mapped attribute. Confirmation uses the same mapping context as encoding;
a changed context produces `mapping_changed`.

## API and UI

Every device attribute exposes `write_state`: status, resolved numeric constraints,
options with availability and reasons, warnings, missing-dependency flag and whether
a candidate-specific preview is needed. Device DTOs include `write_state_revision`.

`POST /devices/{id}/commands/preview` accepts the same attribute/value body as command
submission. It returns eligibility, normalized candidate, reasons, warnings and a
revision without writing or creating history. Grouped preparation uses this evaluator
for every member. Confirmation checks current eligibility and warnings again.

Submitted refusals are recorded directly as terminal command errors with structured
`validation`; they never pass through pending execution and never reach transport.
The commands migration adds nullable JSON fields for validation and the original
submitted scalar, preserving invalid submissions without coercing them during history
reads. Legacy rows remain readable.

WebSocket `device_write_state` events update eligibility independently of telemetry.
These events also carry raw-code resolution diagnostics. Clients ignore old revisions and never create time-series points from these events.
The UI displays server decisions; it does not resolve guard dependencies locally.

Presentation controls support `visible_when` and `blocked_when` under
`control-conditions/1`; page nodes support `visible_when` under `page-conditions/1`.
A `variant` page node (`layout-variants/1`) chooses the first matching
`{when, content}` entry. These use the presentation binding condition syntax and are
evaluated by the client that renders the document, like face visibility and colors.
Groups use generic controls when member layout selections differ.

The two condition syntaxes have distinct jobs. Write rules and option conditions use
the expression syntax and are evaluated only by the server: they decide whether a
command is accepted. Presentation conditions use the binding syntax and are evaluated
only by the client: they decide what a page shows. A control bound to an attribute
already follows that attribute's `write_state`, so a restriction declared once as a
write rule disables the control and refuses the API command without any `blocked_when`.
Reserve `blocked_when` for purely graphical blocking; presentation visibility never
forbids an API command.

## Human confirmation in the UI

An attribute can declare `user_confirmation` using the same `LocalizedText`
contract as its label (a nonempty `default`, optional `translations`). The text
must describe the actual consequence of the change. It is plain text, never an
expression or value-interpolated template. Nothing is inferred from a group,
attribute name or manufacturer.

```yaml
- name: network_password
  data_type: str
  read_write: /network/password
  sensitive: true
  user_confirmation:
    default: Changing this setting can disconnect the device until its network configuration is updated.
    translations:
      fr: Cette modification peut déconnecter l'équipement jusqu'à la mise à jour de sa configuration réseau.
```

Live controls wait for the final 600 ms debounced intention before opening a
dialog. The dialog shows the target, setting, previous known value, requested
value and consequence. The control remains locked during review. Cancel, Escape,
close and navigation discard the intention. No write slot or command is created
until consent. Generic attribute forms use the same gate. Group commands show
each member's warning in their existing review, with one consent for the selected
targets and values.

Single-device preview responses include a `confirmation_token` when a warning
applies. The UI submits it as `ui_confirmation_token`, with
`confirmation_language`. Group confirmations optionally send
`confirmation_language` with their existing token. Tokens bind the authenticated
user, target, requested value and driver write contract; changes require a fresh
review. Every transport write still revalidates server guards. API, CLI and
automation clients may omit this evidence. It is independent of `confirm`, which
controls device read-back verification.

Command history stores optional `ui_confirmation` with the accepted localized
message and previous value (explicitly known or unknown). The unit command
already carries the target, attribute, requested value, authenticated user and
server timestamp. Both single and batch paths persist these rows before transport.
Existing records and non-UI writes have no invented confirmation context.

`sensitive: true` masks previous and requested values in confirmation history and
command audit rows, including ephemeral batch templates. Known secret values are
also removed from the accepted warning text; authors must never embed credentials
in warning messages. Sensitive command results do not create command-linked
time-series observations. This classification does not change device telemetry
storage or turn a saved executable command template into a secrets store.

The existing command states retain their meaning: `pending` with no `executed_at`
is queued; `executed_at` records the start of a transport attempt; `success` records
completion. Refusals have `error` plus ineligible `validation`; transport failures
have a stable failure code, and missing read-back uses `unconfirmed`. A transport
attempt or missing reply cannot prove whether the physical device changed.
Confirmation evidence is informational, not a hardware protection mechanism.

## Budgets and rollout

The server owns limits: expression depth 16, 64 rules per attribute, 256 list/table
items, 10,000 operations per attribute evaluation and 100,000 per device projection.
Budget exhaustion blocks the operation with a stable reason. No driver override can
raise these limits.

Deploy the backend migration and API before the updated SDK/UI. Existing drivers
continue using their declared codec options and numeric constraints. Specialized
controls no longer invent thermostat mode choices. Driver-specific migration belongs
to its own delivery; no firmware change is required.
