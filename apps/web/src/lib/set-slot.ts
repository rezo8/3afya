/**
 * Identity for one set-completion, so the same one arriving twice logs one row.
 *
 * The key belongs to a set SLOT — this exercise, this set number — not to a tap. Two
 * taps of the same slot must send the SAME key, or the server's unique index never
 * fires and the double tap it exists to stop writes two rows.
 */

/** A slot is one exercise's nth set. Both taps of a double tap compute the same one. */
export const slotId = (exerciseId: string, setNumber: number): string => `${exerciseId}:${setNumber}`;

/**
 * The key for a slot, minting one on first ask. Reads and writes the map synchronously,
 * which is the point: `isPending` is React state read from the last render's closure and
 * a same-frame second tap sees it stale, while this cannot be stale.
 */
export function keyForSlot(keys: Map<string, string>, slot: string, mint: () => string): string {
  const existing = keys.get(slot);
  if (existing) return existing;
  const key = mint();
  keys.set(slot, key);
  return key;
}

/**
 * A key for one set-completion.
 *
 * `crypto.randomUUID` is undefined outside a secure context, and the dev server reached
 * from a phone over the LAN is not one — without the fallback, logging a set would throw
 * there rather than degrade. Nothing here needs to be unpredictable: the key is unique
 * within one workout session, among the handful of sets one person logs.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
