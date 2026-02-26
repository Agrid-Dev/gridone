import { ApiError } from "./apiError";
import camelcaseKeys from "camelcase-keys";
import { toast } from "sonner";
import i18n from "@/i18n";
import { getStoredToken } from "./token";

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
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${relativeUrl}`, {
    ...init,
    headers,
  });

  const data = response.status === 204 ? null : await response.json();

  if (!response.ok) {
    if (response.status === 403) {
      toast.error(i18n.t("errors.forbidden"));
    }
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
