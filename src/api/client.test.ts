import { afterEach, describe, expect, it, vi } from "vitest";
import { signIn, SigningIn } from "./client";

const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json" } });

describe("signIn", () => {
  afterEach(() => vi.unstubAllGlobals());

  // The page being left is replaced by Dex's, so a sign-in adds no history
  // entry (Back after a reload does not return to the same page).
  it("replaces the current page with Dex's, keeping the page to come back to", async () => {
    const replace = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal("location", { origin: window.location.origin, pathname: "/inbox", search: "?cursor=abc", replace, assign });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) =>
        u === "/.well-known/pathops"
          ? json({ oidc: { issuer: "https://dex.example", scopes: ["openid"] }, ui: { clientId: "pathops-ui" } })
          : json({ issuer: "https://dex.example", authorization_endpoint: "https://dex.example/auth", token_endpoint: "https://dex.example/token" }),
      ),
    );
    await expect(signIn()).rejects.toBeInstanceOf(SigningIn);
    expect(assign).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(new URL(replace.mock.calls[0][0]).href).toMatch(/^https:\/\/dex\.example\/auth\?/);
    const pending = Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k) ?? "");
    expect(pending.some((v) => v.includes('"returnTo":"/inbox?cursor=abc"'))).toBe(true);
  });
});
