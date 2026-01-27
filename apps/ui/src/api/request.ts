import { ApiError } from "./apiError";
import camelcaseKeys from "camelcase-keys";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type RequestOptions = {
  camelCase?: boolean;
};

export async function request<T>(
  relativeUrl: string,
  init?: RequestInit,
  options?: RequestOptions,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${relativeUrl}`, init);
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(
      response.status,
      response.statusText,
      text || response.statusText,
    );
  }
  const data = await response.json();

  return options?.camelCase
    ? (camelcaseKeys(data, {
        deep: true,
        preserveConsecutiveUppercase: true,
      }) as T)
    : data;
}
