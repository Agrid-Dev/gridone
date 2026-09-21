# Site protections

A protection refuses a requested write when its condition is not met. It never
sends a stop. Administrators manage `/protections/`; rules apply to UI, API, CLI,
automations and grouped commands.

Use `POST /protections/` to prevent starting A unless B is observed stopped:

```json
{
  "name": "Pump A interlock",
  "explanation": "The two pumps must not run together",
  "target": {"device_id": "pump-a", "attribute": "command", "value": true},
  "condition": {
    "op": "eq",
    "left": {"device_id": "pump-b", "attribute": "running"},
    "right": false
  }
}
```

A reciprocal interlock is a separate rule with device IDs reversed. Dependencies
need a polling or expected push cadence. Missing points and incompatible types
are rejected.

`GET /protections/` includes reference diagnostics. `GET /protections/{id}/history`
returns every revision. Replace with `PUT /protections/{id}`, including the current
`revision`. Retire with `POST /protections/{id}/retire`, including `revision` and a
nonblank `reason`. Retirement retains its author, reason and time.

Preview commands before sending. Known prohibitions and broken references cannot
be overridden. Unknown/stale observations refuse automatic commands. A manual
preview may return `protection_confirmation_required: true` and a
`confirmation_token`. After checking the warning and equipment state, send the
same command with `ui_confirmation_token` and
`acknowledge_unknown_protections: true`. The server records the acknowledgement.
Changed rules or newly blocked state require another preview.

The UI uses its existing confirmation dialog. Unknown group members start
unchecked; selecting and confirming one acknowledges its warning. CLI writes
refuse unknown observations and offer no force flag.

These software guards do not guarantee mutual exclusion for concurrent starts
or replace hardware interlocks. Separate running feedback may remain OFF while
two commands are in flight.
