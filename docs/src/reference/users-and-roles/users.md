# Users and Authentication

A **user** is an account that signs in to Gridone, whether a person using the web app or an application calling the API. Every user holds exactly one [role](roles.md), which decides what the account may do.

---

## Users

| Field | Description |
|---|---|
| `username` | Unique sign-in name, 3 to 64 characters |
| `password` | 5 to 72 characters, stored hashed |
| `role` | Id of a [built-in or custom role](roles.md). Defaults to `operator`. |
| `type` | `user` for a person, `service_account` for an application. Both authenticate the same way; the type is informative. |
| `name`, `email`, `title` | Profile fields, all optional |
| `is_blocked` | Whether the account is currently refused. See [Blocking](#blocking-a-user). |

Users are managed from the **Users** page of the web app or through the [API](../../api-reference.md). Creating, updating, deleting, blocking and unblocking a user requires the `users:write` permission, which only `admin` holds among the built-in roles. A user can only be given a role whose permissions the caller already holds, so a role with `users:write` but without the rest cannot promote anyone, itself included, to `admin`. An administrator cannot delete or block their own account.

### Blocking a user

Blocking is the way to lock an account out immediately: every request from a blocked user is refused, including token refresh, until the account is unblocked. Prefer blocking over deletion when an account may need to come back, or when its history should remain attributable.

---

## The `admin` account and first startup

Gridone ships with no account. On the first start against an empty database it creates one user, `admin`, with the `admin` role and the password given by the `GRIDONE_ADMIN_PASSWORD` environment variable.

- If no user exists and the variable is unset, the server **refuses to start** and says why. It never seeds a credential nobody knows.
- The variable is read only while the database has no user. Once any account exists it has no effect; changing it later does not reset the password.
- The password follows the same rules as any user password.

After the first sign-in, change the password from your profile, and consider unsetting the variable.

!!! tip "Keep two administrators"
    Gridone has no email-based password recovery. If the only administrator loses their password, recovery means editing the database by hand. Create a second `admin` account and store both passwords in a team vault.

---

## Authentication

Gridone authenticates with **bearer tokens**. Signing in with a username and password returns an access token and a refresh token; the access token identifies the caller on every subsequent request, whether it is sent as a header by an API client or as a cookie by the web app. The [developer getting-started](../../getting-started/developers.md#2-authenticate) shows the sign-in exchange.

| Token | Default lifetime | Setting |
|---|---|---|
| Access token | 30 minutes | `ACCESS_TOKEN_EXPIRE_MINUTES` |
| Refresh token | 7 days | `REFRESH_TOKEN_EXPIRE_MINUTES` |

When the access token expires, the refresh token is exchanged for a new pair without asking for the password again. Signing out discards the tokens on the client side; a token that was copied elsewhere stays valid until it expires.

Tokens are signed with the server's `SECRET_KEY`. Set it to a fixed value in production: a server that generates a random key at startup signs every user out on each restart. Rotating the key on purpose is also the way to end every session at once.

Any signed-in user can read their own profile, including the permissions their role grants, and change their own password. Changing your own password requires the current one and needs no permission.

---

## When a change takes effect

| Change | Takes effect |
|---|---|
| Block a user | Immediately, on their next request |
| Edit the permissions of a custom role | Immediately, on the next request of every user holding it |
| Change a user's role | At their next token refresh, at most one access-token lifetime later. Until then the previous role is enforced, and the profile endpoint reports that role and its permissions. |
| Change or reset a password | Sign-in only. Existing sessions stay valid; block the user to end them now. |
| Delete a user | Token refresh is refused. An existing access token stays valid until it expires. |
| Rotate `SECRET_KEY` | Every session ends at the next request |
