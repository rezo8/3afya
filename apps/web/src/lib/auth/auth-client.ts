import { createAuthClient } from "better-auth/react";
import { env } from "@/lib/env";

/**
 * Better Auth client. In dev the Vite proxy makes the API same-origin, so the
 * base URL is the current origin; in prod it's the absolute API origin.
 */
export const authClient = createAuthClient({
  baseURL: env.apiUrl || (typeof window !== "undefined" ? window.location.origin : ""),
  fetchOptions: { credentials: "include" },
});

export const { signIn, signUp, signOut, useSession } = authClient;
