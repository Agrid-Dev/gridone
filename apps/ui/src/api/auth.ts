import { request } from "./request";
export { getStoredToken, storeToken, clearToken } from "./token";

export type LoginPayload = {
  username: string;
  password: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
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

export async function login(payload: LoginPayload): Promise<TokenResponse> {
  return request<TokenResponse>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getMe(): Promise<CurrentUser> {
  return request<CurrentUser>("/auth/me", undefined, { camelCase: true });
}
