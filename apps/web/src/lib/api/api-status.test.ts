import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import {
  couldBeOutage,
  getApiReachable,
  getProbeRequests,
  reportFailure,
  reportReachable,
  reportUnreachable,
  subscribeToApiStatus,
} from "./api-status";

beforeEach(() => reportReachable());

describe("couldBeOutage", () => {
  it("counts a failure that never got a response", () => {
    // What the browser throws when nothing is listening.
    expect(couldBeOutage(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("counts a 500 from the dev proxy standing in for a refused connection", () => {
    // Vite answers 500 text/plain when it cannot reach the API, so dev never sees a throw.
    expect(couldBeOutage(new ApiError(500, "Internal Server Error"))).toBe(true);
    expect(couldBeOutage(new ApiError(503, "Service Unavailable"))).toBe(true);
  });

  it("ignores a request the server answered and refused", () => {
    expect(couldBeOutage(new ApiError(400, "Bad request"))).toBe(false);
    expect(couldBeOutage(new ApiError(401, "Unauthorized"))).toBe(false);
    expect(couldBeOutage(new ApiError(404, "Not found"))).toBe(false);
  });
});

describe("the reachability flag", () => {
  it("starts reachable", () => {
    expect(getApiReachable()).toBe(true);
  });

  it("is not lowered by a failed request on its own", () => {
    // One 500 is not an outage. Nothing is claimed until a probe confirms it.
    reportFailure(new ApiError(500, "Internal Server Error"));
    expect(getApiReachable()).toBe(true);
  });

  it("asks for a probe when a failure could be an outage, and not otherwise", () => {
    const before = getProbeRequests();
    reportFailure(new TypeError("Failed to fetch"));
    expect(getProbeRequests()).toBe(before + 1);

    reportFailure(new ApiError(404, "Not found"));
    expect(getProbeRequests()).toBe(before + 1);
  });

  it("is lowered and raised only by a completed probe", () => {
    reportUnreachable();
    expect(getApiReachable()).toBe(false);
    reportReachable();
    expect(getApiReachable()).toBe(true);
  });

  it("notifies subscribers on a change and on every probe request", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToApiStatus(listener);

    reportUnreachable();
    expect(listener).toHaveBeenCalledTimes(1);
    reportUnreachable();
    expect(listener).toHaveBeenCalledTimes(1);

    reportFailure(new TypeError("Failed to fetch"));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    reportReachable();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
