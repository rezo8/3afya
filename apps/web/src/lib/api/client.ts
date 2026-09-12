import type { ApiErrorBody } from "@afya/shared";
import { env } from "@/lib/env";
import { ApiError } from "./errors";

type Options = RequestInit & { signal?: AbortSignal };

/**
 * The browser's IANA zone, sent on every request so the API can answer "what is today" in the
 * user's calendar rather than the server's. Read per call rather than cached: a laptop that
 * crosses a timezone reports the new one without a reload.
 *
 * A query parameter rather than a header on purpose — a custom header would make every GET a
 * preflighted cross-origin request, costing an extra round-trip against a scale-to-zero
 * backend. Anything the API doesn't recognize falls back to UTC there.
 */
const withTimeZone = (path: string): string => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone) return path;
  return `${path}${path.includes("?") ? "&" : "?"}tz=${encodeURIComponent(zone)}`;
};

async function request<T>(path: string, options: Options = {}): Promise<T> {
  // Only set a JSON Content-Type when there's a body, so GETs stay "simple"
  // requests and don't trigger a cross-origin CORS preflight. Normalize via
  // Headers so a caller-supplied Headers/tuple merges correctly.
  const headers = new Headers(options.headers);
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${env.apiUrl}${withTimeZone(path)}`, {
    credentials: "include", // send/receive the HttpOnly auth cookie
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as Partial<ApiErrorBody> | undefined;
    throw new ApiError(res.status, body?.message ?? res.statusText, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: Options) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>(path, { ...options, method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>(path, { ...options, method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>(path, { ...options, method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string, options?: Options) => request<T>(path, { ...options, method: "DELETE" }),
};
