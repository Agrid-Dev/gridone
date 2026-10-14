# ADR 0008 — Attribute presentation served per driver, off the device payload

- **Status**: Proposed (2026-10-14)
- **Issues**: AGR-1699 (this ADR), AGR-1644 (parent: `GET /devices/` saturates
  the API on large sites), AGR-1696 / AGR-1697 (the two payload cuts that
  preceded it), AGR-1232 (presentation cached by revision in the UI)
- **Related**: ADR 0004 (per-role attribute access), ADR 0005 (declarative
  write validation)

## Context

Every device attribute the API serves carries a copy of the driver's
presentation metadata for that attribute: `label`, `description`,
`user_confirmation`, `group`, `unit`, `value_labels`. The driver declares them
once; the API repeats them on every device of the driver, on every read.

On a site of 400 thermostats sharing a 276-attribute driver, `GET /devices/`
returns 110,402 attributes. Measured on that site's real payload:

| Payload | Raw | Gzipped | Serialisation (local) |
|---|---|---|---|
| Today | 119 MB | 16.5 MB | 1,413 ms |
| Without `label`, `description`, `user_confirmation` | 80 MB | 8.0 MB | 1,173 ms |
| Without the six presentation fields | 74 MB | 7.3 MB | 1,157 ms |

The texts are the part of the payload that does not compress: unique strings
in two languages, repeated 400 times. What would replace them is one document
per driver: 104 kB for the thermostat driver (118 kB with `group`, `unit` and
`value_labels`), 8 kB and 4 kB for the two others, fetched once per session.

Two earlier cuts (AGR-1696, AGR-1697) trimmed the write state and the
serialiser overhead; they could not touch this: the fields are part of the
device contract. Pagination is not an option yet, as an application relies on
the full list.

The precedent exists. The driver's presentation *document* (the device face) is
not copied onto devices: a device carries `presentation_ref.revision`, the UI
fetches the document per driver and caches it by revision (AGR-1232). Attribute
presentation is the same kind of data and should travel the same way.

This is also the first step of a direction discussed since the `value_labels`
work (2026-09): a driver mixes four concerns with different audiences, and the
API should serve them apart.

## Decision

### 1. Attribute presentation belongs to the driver and is served per driver

The six presentation fields of an attribute (`label`, `description`,
`user_confirmation`, `group`, `unit`, `value_labels`) are the driver's
declarations, identical for every device of the driver. The API serves them
once, per driver, and the device attribute stops carrying them.

The driver YAML does not change. Authors keep writing one document; the split
is in what the API serves, not in how a driver is written.

### 2. One resource: `GET /drivers/{driver_id}/attribute-presentation`

The response maps each attribute name to its presentation:

```json
{
  "revision": "3f9c…",
  "attributes": {
    "temperature_setpoint": {
      "label": {"default": "Setpoint", "translations": {"fr": "Consigne"}},
      "description": {"default": "…", "translations": {}},
      "user_confirmation": {"default": "…", "translations": {}},
      "group": "setpoints",
      "unit": "°C",
      "value_labels": null
    }
  }
}
```

Unset fields are omitted, as on device payloads. The resource is named for the
concern it serves, not for one field: `/labels` was considered and rejected
because the same document carries descriptions, confirmations, groups, units
and value labels, and a second resource for those would reproduce the problem.

It sits next to `GET /drivers/{driver_id}/presentation` (the face document) but
is gated by `devices:read`, like the device payloads, not by `drivers:read`:
the document describes what a caller sees on devices, and `devices:read` is
the permission that carries attribute scopes (ADR 0004). `drivers:read`, which
every built-in role holds, has none.

### 3. The document is projected through the caller's scope

ADR 0004 narrows a role to attributes per device. A per-driver document must
not leak the names and texts of attributes the caller cannot read, which is why
a client-side pointer to the whole driver was rejected for `value_labels`.

The response lists an attribute only when the caller's `devices:read` scope
lets it through on at least one device of that driver. Unscoped roles get the
whole document. The projection reuses the policy that projects device
payloads; the driver is the unit of caching, the scope the unit of filtering.

### 4. `presentation_ref.revision` is the cache key

The device's `presentation_ref.revision` already hashes every attribute
contract of the driver, presentation fields included, and changes whenever the
driver is edited. The document carries that revision, and the UI caches it per
driver under the revision it reads on devices, exactly as it caches the face
document. No new token, no new invalidation path: a driver edit moves the
revision on every device, and the next read refetches.

### 5. What stays on the attribute

The attribute keeps what is per device or per instance of the contract:

- state: `current_value`, `last_updated`, `last_changed`, `raw_value`,
  `resolution_error`;
- semantics every client and machine needs: `name`, `data_type`, `kind`,
  `read_write_modes`, and for faults `healthy_values`, `severity`,
  `is_faulty`;
- the server-resolved write state (`write_state`), per ADR 0005.

`write_constraints`, `default_value` and `value_options` are business-rule
declarations that clients should not need once `write_state` resolves them;
they are out of this ADR's scope and are the next candidates.

### 6. Removal is a breaking change, sequenced

Dropping six fields from `Attribute` changes the public device contract for
every API consumer, not only the UI. The change ships in three steps, each a
release:

1. **Serve**: the new resource, the scope projection, the SDK method. Device
   payloads unchanged.
2. **Switch**: the UI reads presentation from the driver resource. The seams
   are narrow: `useAttributeLabel` for labels, `DescriptionHint` for
   descriptions, `AttributeConfirmationContext` and the group-command dialogs
   for confirmations, `attributeUnit` and the value-label renderers for the
   rest. The device fields are marked deprecated in the OpenAPI description.
3. **Remove**: the six fields leave `Attribute` on every device payload (HTTP
   and websocket `device_full_update` / `device_list_update`). Announced as
   breaking in the release notes, after checking the applications that consume
   the SDK. Texts first (`label`, `description`, `user_confirmation`), which
   hold the bulk of the gain; `group`, `unit`, `value_labels` follow once their
   consumers are switched.

Server-side uses are untouched: `user_confirmation` keeps feeding the write
preview and the grouped-command confirmation from the driver, where it lives.

## Consequences

- On the 400-thermostat site, `GET /devices/` loses a third of its raw bytes
  and half of its gzipped bytes once the texts are gone, for one 104 kB
  document per driver per session. Serialisation CPU drops by a sixth; the
  remaining cost is the write state and constraints, addressed separately.
- Device payloads describe devices. Presentation lives with the driver, in one
  place, as the face document already does.
- The UI gains one fetch per driver per session and a reconciliation step
  (attribute name → presentation) in the seams listed above. The fallback
  chain of `useAttributeLabel` (driver label, then the standard-attribute
  translation, then the humanised name) is unchanged.
- Scoped roles see the same attributes in the document as on their devices; a
  role whose scope differs per device sees the union over the driver's
  devices, which is the information it already has.
- Consumers of the SDK must move to the driver resource before step 3. The
  `Attribute` type in the SDK is an open object today (AGR-1698), so the
  removal breaks runtime reads, not compilation: the release notes and the
  deprecation markers are the contract.
- The driver concern split gets its first boundary. The remaining parts
  (communication, business rules, semantics) are not decided here, but the
  mechanism chosen, a per-driver resource referenced by revision, is the one
  they would reuse.

## Open questions

- `unit` is both presentation and a quantity's semantics; charts and the
  timeseries API read it too. Whether it moves with the presentation or stays
  on the attribute is decided at step 3, with its consumers in view.
- Whether the websocket should announce a driver edit so the UI refetches the
  document before the next device read, or whether the revision moving on
  `device_full_update` is enough.
