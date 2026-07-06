/**
 * @gridone/sdk — TypeScript client for the Gridone API.
 *
 * API payloads keep the wire format (snake_case keys, as documented in the
 * OpenAPI schema); SDK code is idiomatic camelCase. `GridoneClient`,
 * `TokenStorage` and `MemoryTokenStorage` land in the next AGR-373 PR.
 */
export {
  GridoneError,
  isGridoneError,
  isNotFound,
  NetworkError,
} from "./errors";
