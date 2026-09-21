# Site protections

A protection refuses a requested write when its condition is not met. It never
sends a stop. Administrators manage `/protections/`; rules apply to UI, API, CLI,
automations and grouped commands.

In the UI, open a device, select **Configuration**, then **Protections**. Administrators can
create a protection, choose a writable attribute and the requested value, then
build the condition from other device observations. The protected device is fixed
to the device being configured. Add a name and an explanation, then save.

The tab lists active and retired protections targeting that device. Open a
protection to inspect its references and revision history, edit it, or retire it
with a reason. Operators and viewers can inspect protections without changing
them. If another administrator changes a rule while it is being edited, the form
keeps the draft and asks the editor to review the latest revision before saving
again. Missing references stay visible so an administrator can repair them.

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

A reciprocal interlock is a separate rule with device IDs reversed. Missing points
and incompatible types are rejected.

Freshness checking is optional and disabled by default. Set `max_age_seconds` to a
positive duration to limit the age of each observed condition point; omit it or
set it to `null` to use the last acquired value regardless of age. The device
configuration form exposes this as **Check data freshness**, with a duration in
seconds. The setting is saved and audited with each protection revision.

No driver cadence is required, including for devices that publish only on change.
A never-observed value remains unknown; a failed read, write or device stop still
invalidates its observation. With freshness enabled, expiry also makes the value
unknown. This setting does not poll the device or alter the driver's update
strategy. A change-only publisher may therefore become stale even when its value
has not changed. Fresh reception of the same value renews the observation's age.

`GET /protections/` includes reference diagnostics; pass `device_id` to filter by
the protected device. `GET /protections/schema` supplies the definition and
retirement form schemas. `GET /protections/{id}/history`
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
