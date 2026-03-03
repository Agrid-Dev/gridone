import camelcaseKeys from "camelcase-keys";
import { ApiError } from "./apiError";
import { getStoredToken } from "./token";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type RequestOptions = {
  camelCase?: boolean;
};

async function fetchWithAuth(
  relativeUrl: string,
  // eslint-disable-next-line no-undef
  init?: RequestInit,
): Promise<Response> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(`${API_BASE_URL}${relativeUrl}`, { ...init, headers });
}

export async function requestBlob(
  relativeUrl: string,
  // eslint-disable-next-line no-undef
  init?: RequestInit,
): Promise<Blob> {
  const response = await fetchWithAuth(relativeUrl, init);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      response.statusText,
      data?.detail ?? response.statusText,
    );
  }
  return response.blob();
}

export async function request<T>(
  relativeUrl: string,
  // eslint-disable-next-line no-undef
  init?: RequestInit,
  options?: RequestOptions,
): Promise<T> {
  const response = await fetchWithAuth(relativeUrl, init);
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new ApiError(
      response.status,
      response.statusText,
      data?.detail || response.statusText,
    );
  }
  return options?.camelCase
    ? (camelcaseKeys(data, {
        deep: true,
        preserveConsecutiveUppercase: true,
      }) as T)
    : data;
}
