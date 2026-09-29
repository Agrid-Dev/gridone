import type { User } from "@gridone/sdk";

/**
 * Human-facing label for a user: display name, else username, else id.
 * Callers without `users:read` only receive `UserBasic` (no `username`).
 */
export function userDisplayName(
  user: Pick<User, "id"> & Partial<Pick<User, "name" | "username">>,
): string {
  return user.name?.trim() || user.username || user.id;
}
