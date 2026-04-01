import { request } from "./request";

export type HealthResponse = {
  status: string;
  version: string | null;
};

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}
