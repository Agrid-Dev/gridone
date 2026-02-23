# gridone-api

HTTP API package for Gridone.

## User/Auth HTTP endpoints

All routes are defined in this package (not in `gridone-users`).

- `POST /auth/login`:
  - Body: username/password
  - Response: bearer access token
- `GET /auth/schema`:
  - Response: JSON schema of AuthPayload (for frontend form validation, e.g. z.fromJSONSchema)
- `GET /auth/me`:
  - Requires bearer token
  - Response: current authenticated user
- `GET /users/`:
  - Requires bearer token
  - Response: list users
- `POST /users/`:
  - Requires bearer token
  - Creates a user
- `GET /users/{user_id}`:
  - Requires bearer token
  - Retrieves one user
- `PATCH /users/{user_id}`:
  - Requires bearer token
  - Updates one user
- `DELETE /users/{user_id}`:
  - Requires bearer token
  - Deletes one user (self-delete forbidden)
