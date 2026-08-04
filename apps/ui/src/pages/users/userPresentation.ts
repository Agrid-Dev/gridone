import type { Role, User } from "@gridone/sdk";

export const ROLES: Role[] = ["admin", "operator", "viewer"];

export function getUserInitials(name: string, username: string): string {
  const source = name.trim() || username.trim();
  const parts = source.split(/\s+/);
  return (
    parts.length > 1
      ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`
      : source.slice(0, 2)
  ).toUpperCase();
}

export function getUserRole(user: User): Role {
  return user.role ?? "viewer";
}
