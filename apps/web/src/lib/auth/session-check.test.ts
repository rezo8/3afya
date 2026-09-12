import { describe, expect, it } from "vitest";
import { checkSession } from "./session-check";

describe("checkSession", () => {
  it("reports a signed-in user", async () => {
    const check = await checkSession(async () => ({ data: { user: { id: "u1" } }, error: null }));
    expect(check).toEqual({ answered: true, signedIn: true });
  });

  it("reports a signed-out visitor", async () => {
    // What Better Auth actually returns with no session cookie: a clean null, no error.
    const check = await checkSession(async () => ({ data: null, error: null }));
    expect(check).toEqual({ answered: true, signedIn: false });
  });

  it("does not answer when the request never completed", async () => {
    // An unreachable API throws before resolving — this is the case that signed people out.
    const check = await checkSession(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(check).toEqual({ answered: false });
  });

  it("does not answer when the server replied with an error", async () => {
    const check = await checkSession(async () => ({ data: null, error: { status: 500 } }));
    expect(check).toEqual({ answered: false });
  });
});
