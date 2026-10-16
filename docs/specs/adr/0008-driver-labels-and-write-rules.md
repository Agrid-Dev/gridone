# ADR 0008 — Labels and write rules served per driver, off the device payload

- **Status**: Proposed (2026-10-14)
- **Issues**: AGR-1699 (this ADR), AGR-1644 (parent: `GET /devices/` saturates
  the API on large sites), AGR-1696 / AGR-1697 (the two payload cuts that
  preceded it)
- **Related**: ADR 0004 (per-role attribute access), ADR 0005 (declarative
  write validation)

## Context

A driver is one document with four concerns and four audiences:

- **declaration and I/O**: addresses, codecs, value mappings, polling, push,
  `env`, discovery — how to talk to the device; integrators only, never leaves
  the server in full;
- **labels**: what to call an attribute and how to group it for a person;
- **presentation**: the device face document; already served apart
  (`GET /drivers/{id}/presentation`), cached by revision (AGR-1232);
- **business rules**: what may be written, within which bounds, with which
  confirmation (ADR 0005); the server evaluates them, clients see the result.

Today every device attribute the API serves carries a copy of the driver's
labels (`label`, `description`, `group`, `value_labels`) and of its write-rule
declarations (`write_constraints`, `default_value`, `value_options`,
`user_confirmation`). The driver declares them once; the API repeats them on
every device of the driver, on every read, next to the `write_state` that
already resolves the rules per device.

On a site of 400 thermostats sharing a 276-attribute driver, `GET /devices/`
returns 110,402 attributes. Measured on that site's real payload:

| Payload | Raw | Gzipped | Serialisation (relative) |
|---|---|---|---|
| Today | 119 MB | 16.5 MB | 100 % |
| Labels extracted | 86 MB | 8.7 MB | 84 % |
| Write rules extracted | 95 MB | 13.7 MB | 60 % |
| Both extracted | **62 MB** | **5.8 MB** | **47 %** |

The labels are the part that does not compress (unique strings in two
languages, repeated 400 times); the write rules are the part that costs CPU
(deep expression trees). What replaces them is two documents per driver,
88 kB and 67 kB for the thermostat driver, fetched once per session.

Two earlier cuts (AGR-1696, AGR-1697) trimmed the write state and the
serialiser overhead; they could not touch this: the fields are part of the
device contract. Pagination is not an option yet, as an application relies on
the full list.

## Decision

### 1. Labels and write rules are the driver's; the API serves them per driver

Both are declarations of the driver, identical for every device of the driver.
The API serves each concern once, per driver, and the device attribute stops
carrying them. The presentation document is not touched: it stays the isolated
resource it is, and no attribute-level presentation resource is added.

The driver YAML does not change. Authors keep writing one document; the split
is in what the API serves, not in how a driver is written. Splitting the
authoring format is a later decision, which this one does not prejudge.

### 2. Two resources

`GET /drivers/{driver_id}/labels` — the human-facing side of each attribute:

```json
{
  "revision": "3f9c…",
  "attributes": {
    "temperature_setpoint": {
      "label": {"default": "Setpoint", "translations": {"fr": "Consigne"}},
      "description": {"default": "…", "translations": {}},
      "group": "setpoints",
      "value_labels": [{"value": true, "label": {"default": "On", "translations": {}}}]
    }
  }
}
```

`GET /drivers/{driver_id}/write-rules` — the declared rules of each writable
attribute, as the driver states them:

```json
{
  "revision": "3f9c…",
  "attributes": {
    "temperature_setpoint": {
      "write_constraints": {"step": 0.5, "minimum": {"attribute": "…"}, "maximum": 30},
      "write_rules": [{"condition": {"…": "…"}, "reason": {"code": "locked"}}],
      "write_options": null,
      "default_value": 20,
      "value_options": null,
      "user_confirmation": {"default": "…", "translations": {}}
    }
  }
}
```

Unset fields are omitted, as on device payloads. `value_mapping` stays out: it
decodes wire codes, which is I/O, not a rule.

Few clients need the write-rules document: the server resolves the rules into
`write_state` on every device, and the write preview and grouped commands
already return the confirmation text. The resource exists so that the removal
loses nothing: driver tooling, audits and the SDK can still read what a driver
declares.

### 3. Both are gated by `devices:read` and projected through the caller's scope

ADR 0004 narrows a role to attributes per device. A per-driver document must
not leak the names, labels or rules of attributes the caller cannot read, which
is why a client-side pointer to the whole driver was rejected for
`value_labels`.

Each document lists an attribute only when the caller's `devices:read` scope
lets it through on at least one device of that driver; unscoped roles get the
whole document. The projection reuses the policy that projects device
payloads. `drivers:read`, which every built-in role holds, carries no attribute
scope and is not the right gate.

### 4. The device carries a driver revision; both documents are cached by it

A device gets a `driver_revision`: a hash of the driver's contract, computed
once per driver and memoised as the presentation revision already is. Both
documents return the same revision, and the UI caches each document per
driver under the revision it reads on devices. A driver edit moves the
revision on every device; the next device read refetches the documents. No
TTL, no driver-change event needed.

The presentation keeps its own `presentation_ref.revision`: it is scoped to
the face document and its resources, and stays isolated.

### 5. What stays on the attribute

The attribute keeps what is per device, or what every client and machine needs
to read a value:

- state: `current_value`, `last_updated`, `last_changed`, `raw_value`,
  `resolution_error`;
- semantics: `name`, `data_type`, `kind`, `read_write_modes`, `unit`, and for
  faults `healthy_values`, `severity`, `is_faulty`;
- the server-resolved `write_state` (ADR 0005), the only thing a client needs
  to offer a write.

`unit` stays: it qualifies the value, charts and the timeseries API read it,
and it costs 0.6 MB on this site.

### 6. Removal is a breaking change, sequenced

Dropping eight fields from `Attribute` changes the public device contract for
every API consumer, not only the UI. Each concern ships in three steps, each a
release, labels first:

1. **Serve**: the resource, the scope projection, `driver_revision` on
   devices, the SDK method. Device payloads unchanged.
2. **Switch**: the UI reads the document instead of the attribute, and the
   device fields are marked deprecated in the OpenAPI description. The seams
   are narrow. Labels: `useAttributeLabel`, `DescriptionHint`, the attribute
   grouping of the device page, the value-label renderers. Write rules: the
   `value_options` fallback of the control runtime and the command forms (seven
   files), two readers of `default_value`, none of `write_constraints`. On the
   server, the grouped-target contract (`api/targets.py`) reads the rules from
   the driver instead of aggregating device copies.
3. **Remove**: the fields leave `Attribute` on every device payload (HTTP and
   websocket `device_full_update` / `device_list_update`). Announced as
   breaking in the release notes, after checking the applications that consume
   the SDK.

Server-side evaluation is untouched: the rules keep feeding `write_state`, the
write preview and the grouped-command confirmation from the driver, where they
live.

## Consequences

- On the 400-thermostat site, `GET /devices/` drops to half its raw bytes and
  a third of its gzipped bytes, and serialisation CPU halves, for two
  documents per driver per session. What remains on the attribute is state,
  semantics and `write_state`.
- The device payload describes devices. The driver's declarations are served
  by concern, each once: presentation (already), labels, write rules. The
  declaration and I/O concern remains inside `GET /drivers/{id}`, for
  integrators.
- The UI gains two fetches per driver per session and a reconciliation step
  (attribute name → document entry) at the seams above. The fallback chain of
  `useAttributeLabel` (driver label, then the standard-attribute translation,
  then the humanised name) is unchanged.
- Scoped roles see the same attributes in the documents as on their devices;
  a role whose scope differs per device sees the union over the driver's
  devices, which is the information it already has.
- Consumers of the SDK must move to the driver resources before step 3. The
  `Attribute` type in the SDK is an open object today (AGR-1698), so the
  removal breaks runtime reads, not compilation: the release notes and the
  deprecation markers are the contract.
- The driver concern split gets its first two boundaries at the API, with one
  mechanism (a per-driver resource, cached by the driver revision devices
  carry) that the remaining concern would reuse. Whether the authoring format
  follows is a separate decision.

## Open questions

- Whether `write_state` should also stop carrying `options` once
  `value_options` and `value_labels` are served per driver, or whether the
  resolved availability per option is worth its 33 kB per thermostat.
- Whether the write-rules document should be gated by `devices:command`
  rather than `devices:read`, since only a caller who may write has a use for
  it.
