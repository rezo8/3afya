/** Normalized API error carrying the HTTP status and any parsed body. */
export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}

/** Statuses in the 4xx range that ask the caller to try the same request again. */
const RETRYABLE_CLIENT_STATUSES = new Set([408, 429]);

/**
 * Whether running the same write again could plausibly succeed.
 *
 * A rejected `fetch` never becomes an `ApiError` — it throws before a response exists —
 * so anything that isn't one is a transport failure and worth another attempt. A 4xx is
 * the server rejecting the request itself, which a retry only repeats.
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (RETRYABLE_CLIENT_STATUSES.has(err.status)) return true;
    return err.status >= 500;
  }
  return true;
}
