# gridone-users

Domain package for identity and access: user accounts, authentication
primitives, and roles as the permission vocabulary in data.

## Responsibilities

- Public and internal user models (`User`, `UserInDB`, `UserUpdate`)
- Password hashing and verification
- JWT service (`AuthService`) without HTTP framework coupling
- The permission vocabulary (`Permission`), built-in roles and custom role
  documents (`Role`, `RoleCreate`, `RoleUpdate`)
- Storage abstractions (`UsersStorageBackend`, `RolesStorageBackend`) and
  implementations, one per table
- High-level operations on both (`UsersService`)

## Design notes

- `UsersService` exposes public `User` models at its API boundaries.
- `UserInDB` stays internal to storage/manager internals.
- Not-found cases raise `models.errors.NotFoundError`.
- No FastAPI dependency exists in this package; HTTP wiring belongs to `gridone-api`.

## Users and roles stay apart

Users and roles are one service because they are one bounded context, not
because they share logic. They meet in exactly two rules, both in
`UsersService`: a user must reference an existing role, and a role referenced
by a user cannot be deleted. Everything else is kept separate, and the import
contracts in the root `pyproject.toml` enforce it:

- `users.roles` (documents, built-ins) imports nothing from the users side:
  not `users.models`, not the service, not any storage.
- `users.models` never imports `users.roles`. A user carries its role as a
  plain id string.
- Each storage backend serves one table. The users backends never import
  `users.roles`; the roles backends never import `users.models`. There is no
  SQL join or foreign key between `users` and `roles`: built-in roles are not
  rows, so the reference is enforced by the service, in both directions.
- The single crossing at storage level is `UsersStorageBackend.any_with_role`,
  the one fact the roles side needs and asks for through the users backend.
- A role's `scopes` are stored as a shape-validated document and never
  evaluated here: the API compiles them into a policy per request
  (`api.access`). This package knows no device.

When a change needs both sides, put it in the service. When it needs only
one, it belongs on that side and the contracts will tell you if it leaked.
