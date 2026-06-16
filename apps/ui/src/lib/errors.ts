import { isNotFound } from "@/api/apiError";

/**
 * Thrown by resource hooks/components when a resource is missing on the client
 * side — e.g. a lookup that yields nothing. Server-side 404s arrive as
 * `ApiError(404)` instead; both are treated as "not found" by the resource
 * boundary.
 */
export class ResourceNotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

/** True for a `ResourceNotFoundError` or an `ApiError` with a 404 status. */
export function isResourceNotFound(error: unknown): boolean {
  return error instanceof ResourceNotFoundError || isNotFound(error);
}
