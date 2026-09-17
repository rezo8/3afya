import { describe, expect, it } from "vitest";
import { IDEMPOTENCY_KEY_MAX } from "@afya/shared";
import { keyForSlot, newIdempotencyKey, slotId } from "./set-slot";

describe("slotId", () => {
  it("is the same for two taps of the same set", () => {
    expect(slotId("ex-1", 3)).toBe(slotId("ex-1", 3));
  });

  it("differs between set numbers of one exercise", () => {
    expect(slotId("ex-1", 3)).not.toBe(slotId("ex-1", 4));
  });

  it("differs between exercises at the same set number", () => {
    expect(slotId("ex-1", 3)).not.toBe(slotId("ex-2", 3));
  });
});

describe("keyForSlot", () => {
  const counter = () => {
    let n = 0;
    return () => `key-${++n}`;
  };

  it("mints a key the first time a slot is asked for", () => {
    expect(keyForSlot(new Map(), slotId("ex-1", 1), counter())).toBe("key-1");
  });

  it("returns the same key for a second tap of one slot", () => {
    const keys = new Map<string, string>();
    const mint = counter();
    const slot = slotId("ex-1", 1);
    expect(keyForSlot(keys, slot, mint)).toBe("key-1");
    expect(keyForSlot(keys, slot, mint)).toBe("key-1");
  });

  it("gives interleaved exercises their own keys", () => {
    const keys = new Map<string, string>();
    const mint = counter();
    expect(keyForSlot(keys, slotId("ex-1", 1), mint)).toBe("key-1");
    expect(keyForSlot(keys, slotId("ex-2", 1), mint)).toBe("key-2");
    expect(keyForSlot(keys, slotId("ex-1", 1), mint)).toBe("key-1");
  });

  it("gives the next set its own key", () => {
    const keys = new Map<string, string>();
    const mint = counter();
    expect(keyForSlot(keys, slotId("ex-1", 1), mint)).toBe("key-1");
    expect(keyForSlot(keys, slotId("ex-1", 2), mint)).toBe("key-2");
  });

  it("mints afresh for a slot whose key was cleared", () => {
    const keys = new Map<string, string>();
    const mint = counter();
    const slot = slotId("ex-1", 1);
    expect(keyForSlot(keys, slot, mint)).toBe("key-1");
    keys.clear();
    expect(keyForSlot(keys, slot, mint)).toBe("key-2");
  });
});

describe("newIdempotencyKey", () => {
  /**
   * A phone hitting the dev server over the LAN has no secure context and therefore no
   * `crypto.randomUUID`. Node has one, so the fallback is the branch that never runs
   * where it is written — which is exactly why it is worth running here.
   */
  const withoutRandomUUID = <T>(body: () => T): T => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try {
      return body();
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  };

  it("does not repeat itself", () => {
    const keys = new Set(Array.from({ length: 200 }, newIdempotencyKey));
    expect(keys.size).toBe(200);
  });

  it("does not repeat itself without crypto.randomUUID either", () => {
    const keys = withoutRandomUUID(() => new Set(Array.from({ length: 200 }, newIdempotencyKey)));
    expect(keys.size).toBe(200);
  });

  it("returns a usable key where crypto.randomUUID does not exist", () => {
    const key = withoutRandomUUID(newIdempotencyKey);
    expect(key).not.toBe("");
    // The server refuses a key longer than this and falls back to treating the request
    // as keyless, which would silently switch this ticket's protection off.
    expect(key.length).toBeLessThanOrEqual(IDEMPOTENCY_KEY_MAX);
  });
});
