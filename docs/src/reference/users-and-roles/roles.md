# Roles and Permissions

Access to Gridone is described by four concepts.

| Concept | Definition |
|---|---|
| **User** | An account that authenticates against Gridone: a person or an application. Every user holds exactly one role. See [Users and Authentication](users.md). |
| **Role** | A named set of permissions, identified by a short id such as `operator`. Gridone ships three built-in roles and lets administrators define custom ones. |
| **Permission** | The right to act on one kind of resource at one level, such as `devices:read`. Permissions are held by roles, never by users directly. |
| **Scope** | An optional restriction that narrows a device permission down to specific devices and attributes. Scopes are planned, not yet available — see [Scopes](#scopes). |

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
| `assets` | [Zones](glossary.md#zone) and assets | `read`, `write` |
| `transports` | [Networks](glossary.md#network) and discovery | `read`, `write` |
| `drivers` | [Drivers](glossary.md#driver) | `read`, `write` |
| `timeseries` | Recorded device history | `read` only: history is written by Gridone itself |
| `automations` | [Automations](glossary.md#automation) and their executions | `read`, `write` |
| `notifications` | Dispatching a [notification](glossary.md#notification) to other users | `write` only: reading and dismissing your own needs no permission |
| `dashboards` | Dashboards | `read`, `write` |
| `synoptics` | Synoptics | `read`, `write` |

### Device specifics

Devices are the one resource where "write" is two different things: configuring the device, and operating the equipment behind it. Gridone keeps them apart so that a role can turn a thermostat up without being able to delete it.

| Permission | Grants |
|---|---|
| `devices:write` | Configuring devices: creating, updating and deleting them, managing their tags and views |
| `devices:command` | Operating devices: sending a [command](glossary.md#command) to writable attributes, alone, in batch or through a template |
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
| `notifications:write` | ✓ | | |
| `dashboards:read` | ✓ | ✓ | ✓ |
| `dashboards:write` | ✓ | ✓ | |
| `synoptics:read` | ✓ | ✓ | ✓ |
| `synoptics:write` | ✓ | ✓ | |

Built-in roles cannot be edited or deleted. Because `admin` always holds every permission, an instance cannot lock itself out by misconfiguring a role.

`operator` is the default role of a new user.

---

## Custom roles

An administrator can define additional roles when the built-in ones do not fit. A custom role is a document with four fields:

| Field | Description |
|---|---|
| `id` | A short slug, unique across built-in and custom roles. It is what a user's `role` field refers to, and it cannot be changed after creation. |
| `name` | Display name |
| `description` | Free text, shown in the user form |
| `permissions` | Any subset of the [permissions](#permissions) above |

Custom roles are managed through the [API](../api-reference.md) and require the `roles:write` permission, which only `admin` holds. A role that can manage users can therefore never grant itself a permission it does not have.

Rules:

- A permission outside the vocabulary is rejected.
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

Without `devices:write`, a user with this role cannot create, edit or delete a device. `devices:command` still reaches every writable attribute of every device, thermostat or not: narrowing it to thermostats is what [scopes](#scopes) are for.

---

## Scopes

!!! note "Planned"
    Scopes are not available yet. A role document containing a `scopes` key is rejected. This section describes the concept so that roles can be designed with it in mind.

A permission is all-or-nothing: `devices:command` lets a role write every writable attribute of every device. A **scope** narrows a device permission to a subset of devices and attributes.

Scopes are keyed by the permission they narrow, and only `devices:read` and `devices:command` accept them. A scope selects devices by their [standard type](standard-devices.md) or driver, and optionally lists the attributes it covers. The thermostat operator above, narrowed to what its name says:

```json
{
  "id": "thermostat_operator",
  "name": "Thermostat operator",
  "description": "Reads the building and adjusts comfort settings on thermostats.",
  "permissions": ["devices:read", "devices:command", "timeseries:read", "dashboards:read"],
  "scopes": {
    "devices:command": [
      { "types": ["thermostat"], "attributes": ["temperature_setpoint", "hvac_mode", "fan_speed"] }
    ]
  }
}
```

`devices:read` is left unscoped, so the role still sees every device. `devices:command` now reaches three attributes of thermostats and nothing else. A permission without a scope keeps its full reach, and a device that a role cannot read at all is simply absent from its view.
