# Roles and Permissions

Access to Gridone is described by four concepts.

| Concept | Definition |
|---|---|
| **User** | An account that authenticates against Gridone: a person or an application. Every user holds exactly one role. See [Users and Authentication](users.md). |
| **Role** | A named set of permissions, identified by a short id such as `operator`. Gridone ships three built-in roles and lets administrators define custom ones. |
| **Permission** | The right to act on one kind of resource at one level, such as `devices:read`. Permissions are held by roles, never by users directly. |
| **Scope** | An optional restriction that narrows a device permission down to specific devices and attributes. See [Scopes](#scopes). |

Every operation requires one permission. On each request Gridone resolves the caller's role to its permissions and refuses the operation when the required one is missing. There is no per-user override: to change what a user can do, change their role or edit the role itself.

---

## Permissions

A permission is written `<resource>:<level>`.

| Level | Grants |
|---|---|
| `read` | Listing and reading the resource |
| `write` | Creating, updating and deleting it |

Resources are the kinds of things Gridone manages. Reading never implies writing, and writing never implies reading: a role that configures devices without seeing them is unusual but expressible.

| Resource | Covers | Levels |
|---|---|---|
| `users` | User accounts, blocking, app registration | `read`, `write` |
| `roles` | Built-in and custom roles | `read`, `write` |
| `devices` | Devices, their live values, faults and presentations | `read`, `write`, plus [device specifics](#device-specifics) |
| `assets` | [Zones](../glossary.md#zone) and assets | `read`, `write` |
| `transports` | [Networks](../glossary.md#network) and discovery | `read`, `write` |
| `drivers` | [Drivers](../glossary.md#driver) | `read`, `write` |
| `timeseries` | Recorded device history | `read` only: history is written by Gridone itself |
| `automations` | [Automations](../glossary.md#automation) and their executions | `read`, `write` |
| `operating_rules` | [Site operating rules](../../guides/commands/operating-rules.md) guarding device writes | `read`, `write` |
| `notifications` | Dispatching a [notification](../glossary.md#notification) to other users | `write` only: reading and dismissing your own needs no permission |
| `dashboards` | Dashboards | `read`, `write` |
| `synoptics` | Synoptics | `read`, `write` |

### Device specifics

Devices are the one resource where "write" is two different things: configuring the device, and operating the equipment behind it. Gridone keeps them apart so that a role can turn a thermostat up without being able to delete it.

| Permission | Grants |
|---|---|
| `devices:write` | Configuring devices: creating, updating and deleting them, managing their tags and views |
| `devices:command` | Operating devices: sending a [command](../glossary.md#command) to writable attributes, alone, in batch or through a template |
| `devices:logs:read` | Reading the communication log of an attribute, for troubleshooting |

`devices:command` does not include `devices:read`. A role that operates equipment normally holds both.

### Users specifics

`users:read:basic` lists users as an id and a display name only, without profile or role. It exists so that a role can show who sent a command or pick notification recipients without seeing account details.

### Always allowed

Some actions need no permission beyond being signed in: reading your own profile, changing your own password, and reading or dismissing your own notifications.

---

## Built-in roles

Three roles are defined in code and exist on every instance.

| Role | Intended for |
|---|---|
| `admin` | Administrators. Holds every permission, including user and role management. |
| `operator` | Integrators and building operators. Full control and configuration of the building, no user management. |
| `viewer` | Anyone who needs to look but not touch. Read-only access to the building. |

| Permission | `admin` | `operator` | `viewer` |
|---|:-:|:-:|:-:|
| `users:read` | ✓ | | |
| `users:read:basic` | ✓ | | ✓ |
| `users:write` | ✓ | | |
| `roles:read` | ✓ | ✓ | ✓ |
| `roles:write` | ✓ | | |
| `devices:read` | ✓ | ✓ | ✓ |
| `devices:write` | ✓ | ✓ | |
| `devices:command` | ✓ | ✓ | |
| `devices:logs:read` | ✓ | | |
| `assets:read` | ✓ | ✓ | ✓ |
| `assets:write` | ✓ | ✓ | |
| `transports:read` | ✓ | ✓ | ✓ |
| `transports:write` | ✓ | ✓ | |
| `drivers:read` | ✓ | ✓ | ✓ |
| `drivers:write` | ✓ | ✓ | |
| `timeseries:read` | ✓ | ✓ | ✓ |
| `automations:read` | ✓ | ✓ | ✓ |
| `automations:write` | ✓ | | |
| `operating_rules:read` | ✓ | ✓ | ✓ |
| `operating_rules:write` | ✓ | | |
| `notifications:write` | ✓ | | |
| `dashboards:read` | ✓ | ✓ | ✓ |
| `dashboards:write` | ✓ | ✓ | |
| `synoptics:read` | ✓ | ✓ | ✓ |
| `synoptics:write` | ✓ | ✓ | |

Built-in roles cannot be edited or deleted. Because `admin` always holds every permission, an instance cannot lock itself out by misconfiguring a role.

`operator` is the default role of a new user.

---

## Custom roles

An administrator can define additional roles when the built-in ones do not fit. A custom role is a document with five fields:

| Field | Description |
|---|---|
| `id` | A short slug, unique across built-in and custom roles. It is what a user's `role` field refers to, and it cannot be changed after creation. |
| `name` | Display name |
| `description` | Free text, shown in the user form |
| `permissions` | Any subset of the [permissions](#permissions) above |
| `scopes` | Optional. Narrows `devices:read` to specific devices and attributes, see [Scopes](#scopes) |

Custom roles are managed through the [API](../../api-reference.md) and require the `roles:write` permission. That permission is reserved for the built-in `admin` role: a custom role cannot hold it. Assigning a role to a user, in turn, requires holding every permission of that role. Together the two rules mean no role can hand out more than it has, whether by editing roles or by editing users.

Rules:

- A permission outside the vocabulary is rejected, and so is `roles:write`.
- A scope on a permission the role does not hold, on a permission that is not scopable, or with an empty list is rejected.
- An `id` that already exists is rejected.
- A role assigned to at least one user cannot be deleted. Reassign the users first.
- Changing a role's permissions takes effect on the next request of every user holding it. No re-login is needed.

### Example: a thermostat operator

An occupant-facing role should read the building and adjust comfort settings, but never configure a device or touch accounts:

```json
{
  "id": "thermostat_operator",
  "name": "Thermostat operator",
  "description": "Reads the building and adjusts comfort settings.",
  "permissions": ["devices:read", "devices:command", "timeseries:read", "dashboards:read"]
}
```

Without `devices:write`, a user with this role cannot create, edit or delete a device. It still sees every device and reaches every writable attribute, thermostat or not: narrowing that is what [scopes](#scopes) are for.

---

## Scopes

A permission is all-or-nothing: `devices:read` shows a role every attribute of every device. A **scope** narrows a device permission to a subset of devices and attributes.

!!! note "Reading only, for now"
    Only `devices:read` accepts a scope in this release. A scope on `devices:command` is rejected as "not scopable yet", so that no one believes a write restriction is in force before Gridone enforces one.

Scopes are keyed by the permission they narrow. Each scope has two parts: which **devices** it reaches, selected by [standard type](../standard-devices.md) or by driver, and optionally which **attributes** of those devices. A part left out is no restriction. A role that reads thermostats, and only their comfort values:

```json
{
  "id": "comfort_reader",
  "name": "Comfort reader",
  "description": "Sees the temperature and setpoint of every thermostat, nothing else.",
  "permissions": ["devices:read", "timeseries:read", "dashboards:read"],
  "scopes": {
    "devices:read": [
      { "devices": { "types": ["thermostat"] }, "attributes": ["temperature", "temperature_setpoint"] }
    ]
  }
}
```

How a scope is read:

- **Inside a scope, parts intersect.** A device must match every part that is set: here it must be a thermostat, and only the two listed attributes are visible on it. `{}` is a scope with no restriction.
- **Across scopes, matches union.** Listing two scopes under the same permission reaches what either of them reaches. There are no deny entries and no ordering.
- **A scope never exceeds its permission.** The key must be one of the role's permissions. A permission without a scope keeps its full reach.
- **Type or driver.** `types` matches devices whose driver declares a standard type; a device with an untyped driver is reachable through `driver_ids` only.

What a scoped role is served follows one rule: what it cannot read does not exist for it. A hidden attribute is absent from the device, its history and the live feed. A device with no readable attribute is absent from lists, answers "not found" when addressed directly, and is left out of attribute coverage, faults and communication logs. Two pieces of metadata stay visible because Gridone computes them over the whole device: whether a device is faulty, and the fact that a device exists when a command targets it.

Roles without scopes, built-in or custom, are unaffected: scopes only narrow, they never grant.
