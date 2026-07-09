import type { GridoneClient } from "@gridone/sdk";

/** JSON schema of AuthPayload from the API (Pydantic model_json_schema()). */
export type AuthSchemaProperty = {
  type?: "string" | "number" | "integer" | "boolean";
  minLength?: number;
  maxLength?: number;
  title?: string;
  description?: string;
};

export type AuthSchema = {
  type?: "object";
  title?: string;
  properties?: Record<string, AuthSchemaProperty>;
  required?: string[];
};

/** `GET /auth/schema` — not covered by an SDK namespace yet. */
export function getAuthSchema(client: GridoneClient): Promise<AuthSchema> {
  return client.request<AuthSchema>("GET", "/auth/schema");
}
