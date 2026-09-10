# ADR 0004 — Custom roles with scoped device permissions

- **Status**: Proposed (2026-09-09)
- **Issues**: AGR-1199 (this research), AGR-1118 (integration account wants
  "everything except user management"), AGR-1188 (thermostat face — role
  visibility deferred to here)

## Context

Gridone has three hard-coded roles (`admin`, `operator`, `viewer`), a
`StrEnum` in `users.models`, mapped in code to a flat permission set in
`api/permissions.py`. `require_permission` resolves that mapping on every
request from the `role` claim of the JWT.

`devices:read` and `devices:write` cover every device and every attribute.
`devices:write` also covers device creation, deletion and tagging, so "can
send a command" and "can delete the device" are today the same right.

### The motivating case

A vendor thermostat driver exposes 44 attributes, 12 of them writable. Seven
are the standard `thermostat` fields (`temperature`, `temperature_setpoint`,
`onoff_state`, `mode`, `fan_speed`, setpoint bounds); the rest are telemetry
and installer settings (lockouts, maintenance mode, calibration). A
receptionist must be able to change the setpoint and nothing else, and should
not even *see* the installer settings. Today the only role that can touch the
setpoint is `operator`, which can also delete the device.

### What already exists

- **Writability is already on the wire.** Every attribute carries
  `read_write_modes`. The UI's `isAttributeWritable`, the coverage endpoint's
  `writable_count` and the target picker read that set and nothing else.
  There is no role branch anywhere in the device UI.
- **A stable vocabulary across driver variants.** The same thermostat face
  has an MQTTS and a Modbus driver; both declare the standard `thermostat`
  attributes under the same names (AGR-863).
- **`users.role` is already a `TEXT` column** (migration 0002). Only the
  Python enum pins the value set.
- **One resolution seam for writes.** `CompositeTargetResolver` already
  decides, per device, whether an attribute is exposed as writable and reports
  the rest in `excluded_device_ids`.

### Constraints from the issue

Per-driver behaviour must live in data, not code. Ship fast, no premature
abstraction. Devices × attributes is the only deep permission filter we
expect to need.

## Decision

**A role is a stored JSON document: the permissions it holds, plus optional
`scopes` that narrow `devices:read` and `devices:command` down to specific
attributes of specific devices. A scope is keyed by the permission it
narrows, so it introduces no vocabulary of its own. The API projects every
device through the caller's role before responding, and refuses writes the
scopes do not cover. Nothing below the API layer knows roles exist.**

### 1. The role document

```json
{
  "id": "receptionist",
  "name": "Receptionist",
  "description": "Front desk: comfort settings on thermostats, nothing technical.",
  "permissions": [
    "devices:read",
    "devices:command",
    "timeseries:read",
    "dashboards:read",
    "users:read:basic"
  ],
  "scopes": {
    "devices:read": [
      { "types": ["thermostat"] }
    ],
    "devices:command": [
      { "types": ["thermostat"], "attributes": ["temperature_setpoint", "hvac_mode", "fan_speed"] }
    ]
  }
}
```

Read it as: `devices:read` is limited to thermostats, `devices:command` is
limited to three attributes of thermostats, every other permission is
unscoped. The role sees no other device.

`scopes` is a map from a permission the role holds to the list of device
scopes that permission is limited to. Only `devices:read` and
`devices:command` accept scopes; the rest are all-or-nothing, as today.

```python
class DeviceScope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    types: list[str] | None = None        # standard device types; None = any
    driver_ids: list[str] | None = None   # None = any
    attributes: list[str] | None = None   # None = every attribute of the matched devices

SCOPABLE_PERMISSIONS = {Permission.DEVICES_READ, Permission.DEVICES_COMMAND}

class Role(BaseModel):
    id: str
    name: str
    description: str = ""
    permissions: list[Permission]
    scopes: dict[Permission, list[DeviceScope]] = {}   # keys ⊆ permissions ∩ SCOPABLE_PERMISSIONS
    builtin: bool = False
```

A built-in expressed in the same shape has no `scopes`:

```json
{
  "id": "operator",
  "name": "Operator",
  "description": "Full device operation, no user management.",
  "permissions": [
    "devices:read", "devices:write", "devices:command",
    "assets:read", "assets:write",
    "transports:read", "transports:write",
    "drivers:read", "drivers:write",
    "timeseries:read", "automations:read",
    "dashboards:read", "dashboards:write",
    "roles:read"
  ],
  "builtin": true
}
```

A technical role that needs the installer settings scopes `devices:command`
by driver and leaves `devices:read` unscoped:

```json
{
  "id": "hvac_technician",
  "name": "HVAC technician",
  "description": "Every setting on the thermostats, read-only elsewhere.",
  "permissions": ["devices:read", "devices:command", "timeseries:read", "dashboards:read"],
  "scopes": {
    "devices:command": [
      { "driver_ids": ["vendor_thermostat_mqtts", "vendor_thermostat_modbus"] }
    ]
  }
}
```

### 2. Semantics: intersection inside a scope, union across scopes

For a given caller, permission, device and attribute:

```python
def allows(role, permission, device, attribute) -> bool:
    if permission not in role.permissions:
        return False
    if permission not in role.scopes:
        return True                                      # unscoped: today's behaviour
    return any(scope_matches(s, device, attribute) for s in role.scopes[permission])

def scope_matches(scope, device, attribute) -> bool:
    return ((scope.types is None or device.type in scope.types)
        and (scope.driver_ids is None or device.driver_id in scope.driver_ids)
        and (scope.attributes is None or attribute in scope.attributes))

def can_read(role, device, attribute) -> bool:
    return (allows(role, "devices:read", device, attribute)
         or allows(role, "devices:command", device, attribute))   # commanding implies reading

def can_command(role, device, attribute) -> bool:
    return allows(role, "devices:command", device, attribute)
```

- **Inside a scope, fields intersect.** Every field that is set must match. A
  field left out is no constraint. `{}` matches everything, which is the
  same as not scoping the permission.
- **Across scopes, matches union.** The permission applies to an attribute if
  any of its scopes matches. There are no deny entries and no ordering, so
  there is no precedence to explain.
- **A scope never exceeds its permission.** The key must be in
  `permissions`; a scope on a permission the role does not hold is rejected
  at validation, as is a scope on a permission that is not scopable and an
  empty scope list (it would mean "hold the permission on nothing").
- **Commanding implies reading.** An attribute in a `devices:command` scope
  is readable even when the `devices:read` scope does not list it, so the
  receptionist example could drop its `devices:read` entry and still see the
  three attributes it can write.
- **A device with no readable attribute is not served**: absent from lists,
  404 on direct access, excluded from coverage.
- `admin` is the superuser; scopes never apply to it.

### 3. Storage and lifecycle

- Custom roles live in the users service (`roles` table, memory backend for
  tests), with `RoleCreate` / `RoleUpdate` / `RolePublic` DTOs (AGR-1085
  naming) and a `/roles` router on the CRUD route pattern.
- `admin`, `operator`, `viewer` stay in code, served by `GET /roles` with
  `builtin: true`, not editable, not deletable. No seed migration, and a
  deployment cannot lock itself out by editing `admin`.
- `User.role` becomes a `str`, validated on create and update against
  built-ins plus stored roles. No users migration; the JWT `role` claim is
  unchanged in shape.
- Deleting a role assigned to a user is refused (409). One role per user.
- `roles:read` is held by every built-in (the users page needs the list).
  `roles:write` is held by `admin` only, so a role holding `users:write`
  cannot mint a role richer than itself.

### 4. Two vocabulary changes

- **`Permission` moves from `api/permissions.py` to `users/permissions.py`**,
  together with the built-in role table. The users service must validate the
  permission strings it stores, and it cannot import `api`; `api` already
  imports `Role` and `UsersService` from `users`, so the dependency direction
  is unchanged. It does not go to `models`: no other service needs it.
  Route wiring (`require_permission`) stays in `api`.
- **`devices:write` is split.** It keeps device management (create, update,
  delete, tags, timeseries push). New **`devices:command`** gates command
  dispatch, batch commands and templates. `operator` and `admin` hold both,
  so no existing caller loses anything. Without the split a scope is
  decoration: a role that may write a setpoint could still delete the
  thermostat.

### 5. Enforcement: a projection at the API boundary

A per-request policy is compiled from the caller's role. The projection it
applies to a `Device` before it leaves the API:

| For the caller | What the wire carries |
|---|---|
| not `can_read` | attribute removed from `attributes` |
| `can_read`, not `can_command` | `read_write_modes` without `write` |
| `can_command` | unchanged |

No new field, no new endpoint, nothing to do in the UI: `read_write_modes` is
already what every device screen keys on.

The projection is applied by an `AccessScopedDevicesService` wrapping
`DevicesServiceInterface` for the request, so every route and the target
resolver see the projected view without knowing it. The resolver's existing
"not exposed as writable" path then reports non-granted devices in
`excluded_device_ids`; a single-device command on a non-granted attribute
raises `ForbiddenError` (403). Two paths do not go through the devices
manager and get an explicit check: the timeseries routes (keyed by opaque
ids) and the WebSocket feed (filtered per connection instead of broadcast).

The devices manager is untouched. The users service stores scopes as
shape-validated documents and never evaluates them. Only `api` joins the two.

### What is explicitly rejected

| Rejected | Why |
|---|---|
| A scope vocabulary of its own (`level: read \| write`, `access: ...`) | Duplicates the permission names. A scope keyed by the permission it narrows cannot drift from it. |
| Driver-declared access tiers (`access: basic \| installer` per attribute), roles granting tiers | Needs a driver-contract change and a backfill of ~90 drivers before the first role works, and freezes one split per driver where sites disagree. Additive later: a scope could reference a tier instead of names. |
| Per-attribute permission strings (`devices:thermostat:temperature_setpoint:write`) | Combinatorial vocabulary. |
| Deny entries, scope ordering | Every engine that has them needs a precedence spec. A union of allow scopes needs none. |
| Multiple roles per user, per-user overrides | Two ways to say the same thing. A role is cheap to create. |
| Selecting devices by tag or by id in a scope | Out of scope for now. Tags are editable by operators and would make the policy depend on mutable data; ids do not survive device recreation. Both are additive fields if a deployment asks. |
| A policy engine (Casbin, OPA, Oso) | Solves a general problem we do not have. |
| Enforcing inside the devices manager | Leaks identity into a service whose contract is "site specifics are input data". |
| Hiding in the UI only | Not a security boundary; the API is the product. |

## Consequences

1. **Role definitions apply immediately; user reassignment at token refresh.**
   Permissions are resolved from the role document on every request, as they
   are today from the enum. Editing a custom role takes effect on the next
   request; changing a user's role waits for the access token to expire, as
   today.

2. **`Role` stops being a closed type.** The `users.models.Role` enum goes;
   the SDK's `Role` becomes `string`; the users page builds its role select
   from `GET /roles` instead of the `z.enum(["admin","operator","viewer"])`
   literal. `test_authorization.py` gains a custom-role scenario.

3. **Service accounts have a home.** App registration creates a user with
   the default role (`operator`, a known over-grant). A manifest's `reads` /
   `commands` map one-to-one onto `devices:read` / `devices:command`
   scopes keyed by device type; deriving a role
   from the manifest is a later issue with no new concept. The integration
   account of AGR-1118 is a custom role with everything except `users:*` and
   `roles:*`.

4. **Dashboards degrade, they do not enforce.** A widget over an attribute
   the viewer cannot read fetches through the projected endpoints and shows
   no data.

5. **Two one-bit leaks, accepted.** `Device.is_faulty` is rolled up by the
   devices manager over all fault attributes, hidden ones included; and
   `excluded_device_ids` reveals that a device exists. Metadata, not values.

6. **`type` becomes load-bearing.** A scope on `types` matches only devices
   whose driver declares a standard type; untyped drivers are reachable by
   `driver_ids` only.

## Sequencing

Independent of AGR-918: only `api` and `users` change (plus `ForbiddenError`
in `models.errors`); the devices manager, `DevicesFilter` and the shared
models are untouched. Proposed issues, in order:

1. **Vocabulary** — `Permission` and the built-in role table to `users`;
   `devices:command` split; `DeviceScope` in `users`; `ForbiddenError`
   + 403 handler.
2. **Roles entity** — users service models, built-ins in code, memory and
   postgres storage (migration `0005.roles`), CRUD with the delete guard,
   `User.role: str` + existence check; `/roles` router; `roles:read` /
   `roles:write`.
3. **Policy + enforcement** — policy compilation, `AccessScopedDevicesService`,
   resolver integration, timeseries checks, per-connection WebSocket
   filtering; acceptance leg: the receptionist writes the setpoint and can
   neither see nor write a lockout.
4. **UI** — `/roles`, `/roles/new`, `/roles/:id/edit` (react-hook-form + zod
   from the role JSON schema); dynamic role select on the users page; SDK
   regeneration.
5. **Deployment** — example `receptionist` role document shipped in the
   setup repository fixtures, not as a built-in; docs page on roles.

## Open questions

1. **Are fault attributes always readable?** Recommendation: no special
   case; the shipped example scopes `devices:read` to whole devices, and
   hiding faults is a choice the role author makes explicitly.

2. **Scope editor depth in v1.** A schema-validated JSON text area for
   `scopes` is an acceptable first admin surface; role authors at this stage
   are integrators.
