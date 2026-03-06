import camelcaseKeys from "camelcase-keys";
import { ApiError } from "./apiError";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type RequestOptions = {
  camelCase?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchWithAuth(
  relativeUrl: string,
  // eslint-disable-next-line no-undef
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${relativeUrl}`, {
    ...init,
    credentials: "include",
  });

  if (response.status === 401) {
    // Deduplicate concurrent refresh attempts
    if (!refreshPromise) {
      refreshPromise = tryRefreshToken().finally(() => {
        refreshPromise = null;
      });
    }
    const refreshed = await refreshPromise;

    if (refreshed) {
      return fetch(`${API_BASE_URL}${relativeUrl}`, {
        ...init,
        credentials: "include",
      });
    }
  }

  return response;
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
