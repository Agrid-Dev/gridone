# gridone-api

HTTP API package for Gridone.

## API reference

The repo ships a [Bruno](https://www.usebruno.com/) request collection at `requests/` in the repo root. Bruno is a free, open-source API client whose files are plain text and version-controlled alongside the code.

### Load the collection

1. Install Bruno from [usebruno.com](https://www.usebruno.com/).
2. Open Bruno → **Open Collection** → select the `requests/` folder.

### Set environment variables

The collection uses a `local` environment. Open **Environments → local** and fill in:

| Variable | Description |
|---|---|
| `BASE_URL` | API base URL, e.g. `http://localhost:8000` |
| `GRIDONE_USERNAME` | Your login username |
| `GRIDONE_PASSWORD` | Your login password |

`ACCESS_TOKEN`, `REFRESH_TOKEN`, and `TOKEN_EXPIRES_AT` are managed automatically — leave them blank.

### Run authenticated requests

Select the **local** environment in the top-right environment picker. Send any request — the collection's pre-request script handles the OAuth login transparently and caches the token. No manual token handling is needed.

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
