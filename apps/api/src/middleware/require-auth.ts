import type { MiddlewareHandler } from "hono";
import type { ApiErrorBody } from "@afya/shared";
import { auth } from "../auth";

/** Hono environment for authenticated routes — `userId` is set by requireAuth. */
export type AuthedEnv = { Variables: { userId: string } };

/**
 * Gate a route group behind a valid Better Auth session. On success it stashes
 * the user id in the context (`c.get("userId")`) so handlers never trust a
 * client-supplied id. On failure it returns 401 before the handler runs.
 */
export const requireAuth: MiddlewareHandler<AuthedEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json(
      { error: "unauthorized", message: "Sign in to continue." } satisfies ApiErrorBody,
      401,
    );
  }
  c.set("userId", session.user.id);
  return next();
};
