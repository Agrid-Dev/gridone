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

## WebSocket telemetry feed

`GET /ws/devices` streams every device attribute change as it happens. It is the
only WebSocket route; the former `/ws` alias was removed.

The handshake requires a valid access token for a non-blocked account — any role
qualifies, since the lowest one already holds `devices:read`. Two ways to present
the token:

- **Browsers** offer two subprotocols, since a browser `WebSocket` cannot set
  headers:

  ```js
  new WebSocket(url, ["gridone", `gridone.auth.bearer.${accessToken}`]);
  ```

  The server negotiates `gridone`, so the token is never echoed back.

- **Other clients** may send `Authorization: Bearer <access_token>` instead,
  and need offer no subprotocol: the server echoes `gridone` only when it was
  offered.

The `access_token` cookie is not accepted here. A browser attaches cookies to a
handshake opened by any origin, so the socket is deliberately never ambiently
authenticated.

An unauthenticated or untrusted handshake is rejected before `accept()` — uvicorn
answers it with HTTP 403, so the client never reaches an open socket.

The session is bound to the token that opened it: when the access token's `exp`
passes, the server closes the socket with code 1008 and reason `Token expired`.
Clients are expected to refresh their token and reconnect.

### Group commands

`/devices/groups` exposes group CRUD, references, driver presentation, and its
resources. Read permission allows viewers to inspect groups; `devices:write`
allows operators and administrators to manage groups and submit commands.

Manual group writes require two requests:

1. `POST /devices/groups/{id}/commands/preview` with `attribute` and `value`.
   Optional `device_ids` limits the preview to an explicit subset of the group.
   Optional `target` intersects current IDs, types, tags, or an asset with the
   group server-side; an explicit empty ID filter stays empty.
   The response includes a token, current values, eligibility, and known limits.
2. `POST /devices/groups/{id}/commands` with that token and the selected eligible
   `device_ids`. It returns the existing command batch and per-device commands.

Preparing sends nothing. Confirmation freezes the previewed recipients, validates
current membership and eligibility again, and is idempotent for the token's
lifetime. Removed or incompatible recipients produce `group_preview_changed`;
clients must refresh and explicitly confirm again. Tokens belong to one user and
group, expire after ten minutes, and are held in the serving process (a restart
requires a fresh preview). New members cannot silently enter a confirmed batch.

Controls with driver presentation blocking conditions are checked per member.
Because group writes set an absolute attribute value, all declared blockers on
that attribute must allow it. Unknown blocking state excludes the member.

Reusable templates and automation actions store `DevicesFilter.group_id`, which
is intersected with any other filters and resolved once per execution. Empty or
invalid groups never resolve to all devices. Automation history exposes localized
structured group failures, and command history retains actual recipient IDs and
independent per-device outcomes. Manual dispatch of a group template through the
ordinary dispatch endpoint returns `group_preview_required`.
