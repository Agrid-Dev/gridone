import { request } from "./request";

export type AuthValidationRules = {
  usernameMinLength: number;
  usernameMaxLength: number;
  passwordMinLength: number;
  passwordMaxLength: number;
};

export const DEFAULT_AUTH_VALIDATION_RULES: AuthValidationRules = {
  usernameMinLength: 3,
  usernameMaxLength: 64,
  passwordMinLength: 5,
  passwordMaxLength: 128,
};

export function getAuthValidationRules(): Promise<AuthValidationRules> {
  return request<AuthValidationRules>("/auth/validation-rules", undefined, {
    camelCase: true,
  });
}
