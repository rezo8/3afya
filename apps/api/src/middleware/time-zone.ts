import type { MiddlewareHandler } from "hono";
import { DEFAULT_TIME_ZONE, parseTimeZone } from "../day";

/** Hono environment for routes that answer "what is today" — `timeZone` is set by resolveTimeZone. */
export type TimeZoneEnv = { Variables: { timeZone: string } };

/**
 * Resolve the caller's calendar zone once, here, so no handler parses it twice or disagrees
 * about the fallback. The client sends it as a `tz` query parameter on every request.
 *
 * A query parameter rather than a header because a custom header would make every GET a
 * preflighted cross-origin request, and the client deliberately keeps GETs "simple" to avoid
 * paying an extra round-trip against a scale-to-zero backend.
 *
 * The value is untrusted input: anything that is not an IANA zone name falls back to UTC,
 * which is the behaviour every request had before this existed.
 */
export const resolveTimeZone: MiddlewareHandler<TimeZoneEnv> = async (c, next) => {
  c.set("timeZone", parseTimeZone(c.req.query("tz")) ?? DEFAULT_TIME_ZONE);
  return next();
};
