# gridone-users

Domain package for user management and authentication primitives.

## Responsibilities

- Public and internal user models (`User`, `UserInDB`, `UserUpdate`)
- Password hashing and verification
- JWT service (`AuthService`) without HTTP framework coupling
- Storage abstraction (`UsersStorageBackend`) and implementations
- High-level user operations (`UsersManager`)

## Design notes

- `UsersManager` exposes public `User` models at its API boundaries.
- `UserInDB` stays internal to storage/manager internals.
- Not-found cases raise `common.errors.NotFound`.
- No FastAPI dependency exists in this package; HTTP wiring belongs to `gridone-api`.
