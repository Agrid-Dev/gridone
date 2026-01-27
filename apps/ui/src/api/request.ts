import { ApiError } from "./apiError";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

console.log(import.meta.env);

export async function request<T>(
  relativeUrl: string,
  // eslint-disable-next-line no-undef
  init?: RequestInit,
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
  return response.json();
}
