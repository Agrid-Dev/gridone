import snakecaseKeys from "snakecase-keys";
import { request } from "./request";
import type { CurrentUser } from "./auth";

export type User = CurrentUser;

export type UserCreatePayload = {
  username: string;
  password: string;
  isAdmin?: boolean;
  name?: string;
  email?: string;
  title?: string;
};

export type UserUpdatePayload = {
  username?: string;
  password?: string;
  isAdmin?: boolean;
  name?: string;
  email?: string;
  title?: string;
};

export function listUsers(): Promise<User[]> {
  return request<User[]>("/users/", undefined, { camelCase: true });
}

export function createUser(payload: UserCreatePayload): Promise<User> {
  return request<User>(
    "/users/",
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

export function updateUser(
  userId: string,
  payload: UserUpdatePayload,
): Promise<User> {
  return request<User>(
    `/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        snakecaseKeys(payload as Record<string, unknown>, { deep: true }),
      ),
    },
    { camelCase: true },
  );
}

export function deleteUser(userId: string): Promise<void> {
  return request<void>(`/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}
