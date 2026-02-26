import type { CurrentUser } from "@/api/auth";

export function hasPermission(user: CurrentUser, permission: string): boolean {
  return user.permissions.includes(permission);
}

export function hasAnyPermission(
  user: CurrentUser,
  ...permissions: string[]
): boolean {
  return permissions.some((p) => user.permissions.includes(p));
}

export const P = {
  DEVICES_READ: "devices:read",
  DEVICES_MANAGE: "devices:manage",
  DEVICES_COMMAND: "devices:command",
  DRIVERS_READ: "drivers:read",
  DRIVERS_MANAGE: "drivers:manage",
  TRANSPORTS_READ: "transports:read",
  TRANSPORTS_MANAGE: "transports:manage",
  TIMESERIES_READ: "timeseries:read",
  ASSETS_READ: "assets:read",
  ASSETS_MANAGE: "assets:manage",
  USERS_READ: "users:read",
  USERS_MANAGE: "users:manage",
  ROLES_READ: "roles:read",
  ROLES_MANAGE: "roles:manage",
} as const;
