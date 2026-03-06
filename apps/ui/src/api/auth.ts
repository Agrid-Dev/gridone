import { request } from "./request";
import { API_BASE_URL } from "./request";

export type LoginPayload = {
  username: string;
  password: string;
};

export type CurrentUser = {
  id: string;
  username: string;
  isAdmin: boolean;
  name: string;
  email: string;
  title: string;
  mustChangePassword: boolean;
};

export async function login(payload: LoginPayload): Promise<void> {
  const body = new URLSearchParams();
  body.set("grant_type", "password");
  body.set("username", payload.username);
  body.set("password", payload.password);

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    credentials: "include",
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail ?? "Login failed");
  }
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export function getMe(): Promise<CurrentUser> {
  return request<CurrentUser>("/auth/me", undefined, { camelCase: true });
}
