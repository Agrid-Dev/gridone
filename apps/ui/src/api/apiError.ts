export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public details: string,
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = "ApiError";
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status == 404;
}
