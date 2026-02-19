@@
### `users` package

This package provides the user-management domain layer used by the API service.

- **Core responsibilities**:
  - **User models** (public `User` and internal `UserInDB`)
  - **Password hashing & verification**
  - **Persistence abstraction** via `UsersStorageBackend`
  - **High-level operations** encapsulated in `UsersManager`

The API service wires this package into FastAPI routers for authentication and user CRUD:

- **Auth endpoints** (defined in the API service, `auth_router`):
  - `POST /auth/login` – username/password login, returns a bearer `access_token`
  - `GET /auth/me` – returns the current authenticated `User`
- **User endpoints** (defined in the API service, `users_router`; all require authentication):
  - `GET /users/` – list all users
  - `POST /users/` – create a new user
  - `GET /users/{user_id}` – retrieve a single user
  - `PATCH /users/{user_id}` – update an existing user
  - `DELETE /users/{user_id}` – delete a user (cannot delete yourself)

### `UsersManager`

The `UsersManager` class is the main entry point for application code:

- **Construction**:
  - Requires a `UsersStorageBackend` implementation to read/write users.
- **Key methods**:
  - `ensure_default_admin()` – creates a default `admin`/`admin` account if no users exist.
  - `get_by_username(username)` / `get_by_id(user_id)` – lookup helpers.
  - `list_users()` – returns a list of public `User` objects.
  - `create_user(...)` – creates a user, hashing the password and enforcing unique usernames.
  - `update_user(...)` – updates user fields with validation and conflict checks.
  - `delete_user(user_id)` – removes a user, raising if the user does not exist.

### Typical usage

In most cases you will not construct `UsersManager` directly. The API service provides a `get_users_manager` dependency that:

- Instantiates `UsersManager` with the configured `UsersStorageBackend`
- Ensures the default admin user is present at startup
- Injects the manager into route handlers

If you need to use this package in another service, create your own `UsersStorageBackend` implementation and pass it to `UsersManager` to reuse the same user-management logic.
