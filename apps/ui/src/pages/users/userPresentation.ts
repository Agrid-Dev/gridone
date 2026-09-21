import type { Role, User } from "@gridone/sdk";
import type { TFunction } from "i18next";

export function getUserInitials(name: string, username: string): string {
  const source = name.trim() || username.trim();
  const parts = source.split(/\s+/);
  return (
    parts.length > 1
      ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`
      : source.slice(0, 2)
  ).toUpperCase();
}

export function getUserRole(user: User): string {
  return user.role ?? "viewer";
}

/** Built-in roles keep their translated label; other roles show their name. */
export function getRoleLabel(t: TFunction<"users">, role: Role): string {
  return t(`roles.${role.id}`, { defaultValue: role.name });
}

export function getRoleDescription(t: TFunction<"users">, role: Role): string {
  return t(`roleSummary.descriptions.${role.id}`, {
    defaultValue: role.description ?? "",
  });
}
