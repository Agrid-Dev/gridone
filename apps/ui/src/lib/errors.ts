import { ApiError } from "@/api/apiError";

/**
 * Thrown by resource hooks/components when the requested resource cannot be
 * resolved on the client side — a missing route parameter, or a lookup that
 * yields nothing. Server-side 404s arrive as `ApiError(404)` instead; both are
 * treated as "not found" by the resource boundary.
 */
export class ResourceNotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

/** True for a `ResourceNotFoundError` or an `ApiError` with a 404 status. */
export function isResourceNotFound(error: unknown): boolean {
  return (
    error instanceof ResourceNotFoundError ||
    (error instanceof ApiError && error.status === 404)
  );
}
