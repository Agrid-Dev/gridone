import snakecaseKeys from "snakecase-keys";
import { request } from "./request";

export type Role = {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
};

export type RoleCreate = {
  name: string;
  description?: string;
  permissions: string[];
};

export type RoleUpdate = {
  name?: string;
  description?: string;
  permissions?: string[];
};

export type UserRoleAssignment = {
  id: string;
  userId: string;
  roleId: string;
  assetId: string;
};

export type UserRoleAssignmentCreate = {
  userId: string;
  roleId: string;
  assetId: string;
};

// Roles

export function listRoles(): Promise<Role[]> {
  return request<Role[]>("/roles/", undefined, { camelCase: true });
}

export function getRole(id: string): Promise<Role> {
  return request<Role>(`/roles/${id}`, undefined, { camelCase: true });
}

export function createRole(payload: RoleCreate): Promise<Role> {
  return request<Role>(
    "/roles/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { camelCase: true },
  );
}

export function updateRole(id: string, payload: RoleUpdate): Promise<Role> {
  return request<Role>(
    `/roles/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { camelCase: true },
  );
}

export function deleteRole(id: string): Promise<void> {
  return request<void>(`/roles/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// Assignments

export function listAssignments(params?: {
  userId?: string;
  roleId?: string;
}): Promise<UserRoleAssignment[]> {
  const search = new URLSearchParams();
  if (params?.userId) search.set("user_id", params.userId);
  if (params?.roleId) search.set("role_id", params.roleId);
  const qs = search.toString();
  return request<UserRoleAssignment[]>(
    `/roles/assignments/${qs ? `?${qs}` : ""}`,
    undefined,
    { camelCase: true },
  );
}

export function createAssignment(
  payload: UserRoleAssignmentCreate,
): Promise<UserRoleAssignment> {
  return request<UserRoleAssignment>(
    "/roles/assignments/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        snakecaseKeys(payload as Record<string, unknown>, { deep: true }),
      ),
    },
    { camelCase: true },
  );
}

export function deleteAssignment(id: string): Promise<void> {
  return request<void>(`/roles/assignments/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// Permissions catalogue

export function listPermissions(): Promise<string[]> {
  return request<string[]>("/roles/permissions/");
}
