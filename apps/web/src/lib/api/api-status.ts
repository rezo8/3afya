import { ApiError } from "./errors";

/**
 * Whether a failure is consistent with the API being gone. Deliberately loose: it decides
 * only whether to go and check, never what to display.
 *
 * It has to be loose because the same outage looks different depending on who is in front
 * of the API. In production the browser talks to it directly and a dead server throws
 * before any response exists. In dev the Vite proxy answers for it and turns a refused
 * connection into a plain 500. Classifying by status alone would miss one of those.
 */
export function couldBeOutage(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500;
  return true;
}

let reachable = true;
let probeRequests = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * The API answered. This clears any outstanding probe request too — a request that completed
 * is the same evidence a probe would have gathered, and leaving the counter raised would keep
 * `ApiStatusBar` armed for the rest of the session, re-probing on every later emit.
 */
export function reportReachable(): void {
  if (reachable && probeRequests === 0) return;
  reachable = true;
  probeRequests = 0;
  emit();
}

export function reportUnreachable(): void {
  if (!reachable) return;
  reachable = false;
  emit();
}

/**
 * Ask for the server to be checked. A single failed request is not evidence of an outage —
 * a handler can return 500 on its own — so nothing is shown until a probe confirms it.
 */
export function requestProbe(): void {
  probeRequests += 1;
  emit();
}

/** Raise a probe for any failure that could be an outage; ignore the ones that can't be. */
export function reportFailure(err: unknown): void {
  if (couldBeOutage(err)) requestProbe();
}

export function subscribeToApiStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getApiReachable(): boolean {
  return reachable;
}

export function getProbeRequests(): number {
  return probeRequests;
}
