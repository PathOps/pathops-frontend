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

  // A browser without a session at pathops-events signs in there first and
  // comes back, then the UI signs in: once, never again after the UI is up.
  describe("with pathops-events", () => {
    function cell(session: number) {
      const replace = vi.fn();
      const seen: [string, RequestInit | undefined][] = [];
      vi.stubGlobal("location", { origin: window.location.origin, pathname: "/applications", search: "", href: window.location.origin + "/applications", replace });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (u: string, init?: RequestInit) => {
          seen.push([u, init]);
          if (u === "/.well-known/pathops")
            return json({ oidc: { issuer: "https://dex.example", scopes: ["openid"] }, ui: { clientId: "pathops-ui" }, events: { url: "https://events.example" } });
          if (u === "https://events.example/api/v1/session") return new Response("", { status: session });
          return json({ issuer: "https://dex.example", authorization_endpoint: "https://dex.example/auth", token_endpoint: "https://dex.example/token" });
        }),
      );
      return { replace, seen };
    }

    it("without a session there: pathops-events' sign-in first, back to this page", async () => {
      const { replace, seen } = cell(401);
      await expect(signIn()).rejects.toBeInstanceOf(SigningIn);
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace.mock.calls[0][0]).toBe("https://events.example/login?return=" + encodeURIComponent(window.location.origin + "/applications"));
      expect(seen.find(([u]) => u === "https://events.example/api/v1/session")?.[1]).toMatchObject({ credentials: "include" });
    });

    it("back with a session there: the UI's sign-in at Dex", async () => {
      const { replace } = cell(200);
      await expect(signIn()).rejects.toBeInstanceOf(SigningIn);
      expect(replace.mock.calls[0][0]).toMatch(/^https:\/\/dex\.example\/auth\?/);
    });

    it("a sign-in there that did not take (tried moments ago): the UI signs in alone, no loop", async () => {
      cell(401);
      await expect(signIn()).rejects.toBeInstanceOf(SigningIn);
      resetForTests();
      const { replace } = cell(401);
      sessionStorage.setItem("pathops.live.signin", String(Date.now()));
      await expect(signIn()).rejects.toBeInstanceOf(SigningIn);
      expect(replace.mock.calls[0][0]).toMatch(/^https:\/\/dex\.example\/auth\?/);
    });
  });
});
