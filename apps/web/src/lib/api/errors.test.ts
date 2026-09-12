import { describe, expect, it } from "vitest";
import { ApiError, isRetryableError } from "./errors";

describe("isRetryableError", () => {
  it("retries a transport failure, which never reaches ApiError", () => {
    // fetch rejects before a response exists, so this is what a dropped connection throws.
    expect(isRetryableError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not retry a request the server rejected", () => {
    expect(isRetryableError(new ApiError(400, "Bad request"))).toBe(false);
    expect(isRetryableError(new ApiError(404, "Not found"))).toBe(false);
    expect(isRetryableError(new ApiError(409, "Name already used"))).toBe(false);
    expect(isRetryableError(new ApiError(422, "Unprocessable"))).toBe(false);
  });

  it("retries the two 4xx statuses that ask to be retried", () => {
    expect(isRetryableError(new ApiError(408, "Request timeout"))).toBe(true);
    expect(isRetryableError(new ApiError(429, "Too many requests"))).toBe(true);
  });

  it("retries a server failure", () => {
    expect(isRetryableError(new ApiError(500, "Internal error"))).toBe(true);
    expect(isRetryableError(new ApiError(503, "Unavailable"))).toBe(true);
  });
});
