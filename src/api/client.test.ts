import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForTests } from "../auth/oidc";
import { signIn, SigningIn } from "./client";

const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json" } });

describe("signIn", () => {
  beforeEach(() => resetForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
    resetForTests();
  });

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

  // One PathOps sign-in: pathops-events has no sign-in, session or cookie of
  // its own, so the UI's goes straight to Dex and never asks it.
  it("with pathops-events in the Cell: straight to Dex, nothing asked of pathops-events", async () => {
    const replace = vi.fn();
    const seen: string[] = [];
    vi.stubGlobal("location", { origin: window.location.origin, pathname: "/applications", search: "", replace });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => {
        seen.push(u);
        return u === "/.well-known/pathops"
          ? json({ oidc: { issuer: "https://dex.example", scopes: ["openid"] }, ui: { clientId: "pathops-ui" }, events: { url: "https://events.example" } })
          : json({ issuer: "https://dex.example", authorization_endpoint: "https://dex.example/auth", token_endpoint: "https://dex.example/token" });
      }),
    );
    await expect(signIn()).rejects.toBeInstanceOf(SigningIn);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toMatch(/^https:\/\/dex\.example\/auth\?/);
    expect(seen.some((u) => u.startsWith("https://events.example"))).toBe(false);
  });
});
