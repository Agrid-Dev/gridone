import { request } from "./request";

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

export function getAuthSchema(): Promise<AuthSchema> {
  return request<AuthSchema>("/auth/schema");
}
