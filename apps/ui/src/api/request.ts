import { ApiError } from "./apiError";
import camelcaseKeys from "camelcase-keys";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type RequestOptions = {
  camelCase?: boolean;
};

export async function request<T>(
  relativeUrl: string,
  // eslint-disable-next-line no-undef
  init?: RequestInit,
  options?: RequestOptions,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${relativeUrl}`, init);

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
