/** Error raised when the Gridone API responds with a non-2xx status. */
export class GridoneError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string, options?: ErrorOptions) {
    super(`HTTP ${status}: ${detail}`, options);
    this.name = "GridoneError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Error raised when no response was received at all (DNS failure, timeout,
 * connection refused). `status` is 0, following the XHR convention for
 * requests that never reached the server.
 */
export class NetworkError extends GridoneError {
  constructor(detail = "Network request failed", options?: ErrorOptions) {
    super(0, detail, options);
    this.name = "NetworkError";
  }
}

export function isGridoneError(error: unknown): error is GridoneError {
  return error instanceof GridoneError;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof GridoneError && error.status === 404;
}
