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

### Tag groups and shared device views

Device tags are multi-valued: `{ "ecs": ["east", "west"] }`. Keys and values use
Unicode NFC/casefold normalization. Filter keys combine with AND; values of the
same key combine with OR. Empty value lists match nothing. Invalid `key:value`
queries return 422 rather than losing the filter.

`GET /devices/tags` supplies the tag vocabulary and per-value device counts.
`PUT /devices/{id}/tags/{key}` replaces a key using `{ "values": [...] }` (empty
removes it). `/devices/tags/bulk` adds/removes values on a filtered selection;
`/devices/tags/rename` replaces one value across matching devices. Both report
per-device outcomes and preserve unrelated tags. Zone assignment temporarily
retains its singleton `asset_id` adapter.

`/device-views` exposes shared display configuration CRUD: name, description,
filter and ordered `group_by` keys (empty for no subgroups). It stores no device membership. Commands
never depend on view IDs, and deleting a view has no effect on an automation.

The UI's group editor assigns a stable value under the ordinary `group` tag and
saves a view using that criterion. Renaming the group changes its display name;
editing members adds/removes only that value. Deleting a group in the UI removes
its membership tag before deleting the view, so automations targeting that tag
then resolve an empty selection. Other memberships and saved criteria are preserved.

Manual tag commands require `POST /devices/commands/preview` with `target`,
`attribute`, `value` and optional `device_ids`, then
`POST /devices/commands/confirm` with the token and selected eligible IDs.
Preparing sends nothing. Confirmation revalidates the frozen members and their
bindings under the device mutation lock, including the write address, codec, unit,
driver environment and device transport/configuration. Added members cannot enter
the batch; removed or incompatible members require another preview. Tokens are user-bound,
expire in ten minutes and are stored in the serving process. Multiple API workers
require client affinity; restarting the process requires a fresh preview. A retry returns the
same batch; an uncertain failed dispatch cannot resend with the same token.

Direct manual tag dispatch, including a tag-based template, returns
`command_preview_required`. Automations resolve stored tag/driver criteria once
per execution and report `empty_target` or `invalid_target` separately. Per-device
command results use the existing history and batch APIs.

Reads use `devices:read`; tag/view mutations and command preparation/confirmation
use `devices:write`.

### Upgrading scalar device tags

Tags now contain arrays rather than scalar strings. Update API consumers together
with the server and UI. After normalization, keys and values must contain 1–63
letters, digits, underscores, dots or hyphens. Normalization collisions and invalid
tokens must be corrected explicitly before upgrading.

1. Back up and export all devices, command templates, dashboards (including widgets)
   and synoptics from the previous version. Include all pages of each API response.
   Combine the exported lists into one JSON object with `devices`,
   `command_templates`, `dashboards` and `synoptics` keys.
2. Run `uv run python -m migrations preflight-tags --snapshot export.json` from the
   repository root. This read-only audit also checks saved filters and grouping
   keys. Resolve every reported error before migrating.
3. Stop writes from the previous version, back up the database, then run
   `uv run python -m migrations apply` with `STORAGE_URL` or `DATABASE_URL` configured.
   Start the updated API and UI together.
4. Verify representative tag counts, group creation, a view with two grouping
   levels, zone assignment and a previewed command on test devices.

The PostgreSQL migration changes tag uniqueness to `(device_id, key, value)` after
checking legacy data; rollback refuses to discard multiple values. Legacy scalar
YAML tags remain readable and are written as arrays on the next mutation. Startup
checks detect normalization collisions across YAML files. Zones continue to use a
single `asset_id` value during this transition; asset and `usage_type` retirement
are separate changes.
