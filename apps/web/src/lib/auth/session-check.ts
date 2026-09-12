/** What the server said about the session, or the fact that it could not be asked. */
export type SessionCheck = { answered: true; signedIn: boolean } | { answered: false };

/** The shape `authClient.getSession()` resolves to; it throws instead when the request fails. */
type SessionResult = { data: unknown; error: unknown };

/**
 * Asking whether you are signed in has three outcomes, not two. A signed-out visitor gets
 * `{ data: null, error: null }`. An unreachable server makes the call throw before it
 * resolves at all, and a server that answers with an error has not answered the question
 * either. Only a clean `data: null` means signed out.
 *
 * Conflating "couldn't ask" with "not signed in" is what ejected people mid-workout on gym
 * wifi (T-005): an offline app cannot prove you are signed out, so it must not act as if it had.
 */
export async function checkSession(getSession: () => Promise<SessionResult>): Promise<SessionCheck> {
  try {
    const { data, error } = await getSession();
    if (error) return { answered: false };
    return { answered: true, signedIn: data != null };
  } catch {
    return { answered: false };
  }
}
