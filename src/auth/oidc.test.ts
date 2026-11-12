import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthError,
  accessToken,
  authorizationUrl,
  base64url,
  challenge,
  completeSignIn,
  loadConfig,
  resetForTests,
  safeReturn,
} from "./oidc";

const issuer = "https://dex-test.example";
function discoveryFetch(extra: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const r = extra(url, init);
    if (r) return r;
    if (url === "/.well-known/pathops")
      return Response.json({ oidc: { issuer, clientId: "pathops-cli", scopes: ["openid", "profile", "email"] }, ui: { clientId: "pathops-ui" } });
    if (url === issuer + "/.well-known/openid-configuration")
      return Response.json({ issuer, authorization_endpoint: issuer + "/auth", token_endpoint: issuer + "/token" });
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

afterEach(() => resetForTests());

describe("PKCE", () => {
  it("computes the RFC 7636 S256 challenge", async () => {
    expect(await challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(base64url(new Uint8Array([251, 255]))).toBe("-_8");
  });
});

describe("sign-in", () => {
  it("uses the Tenant CP's UI client at the Cell's Dex, with S256 and a state", async () => {
    const cfg = await loadConfig(discoveryFetch());
    expect(cfg.clientId).toBe("pathops-ui");
    const url = new URL(await authorizationUrl(cfg, "/applications/x/builds"));
    expect(url.origin + url.pathname).toBe(issuer + "/auth");
    expect(url.searchParams.get("client_id")).toBe("pathops-ui");
    expect(url.searchParams.get("redirect_uri")).toBe(window.location.origin + "/auth/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid profile email offline_access");
    const pending = JSON.parse(sessionStorage.getItem("pathops.oidc.pending")!);
    expect(url.searchParams.get("state")).toBe(pending.state);
    expect(url.searchParams.get("code_challenge")).toBe(await challenge(pending.verifier));
    expect(pending.returnTo).toBe("/applications/x/builds");
  });

  it("refuses a Cell without a UI client", async () => {
    const f = discoveryFetch((url) =>
      url === "/.well-known/pathops" ? Response.json({ oidc: { issuer, clientId: "pathops-cli" } }) : undefined,
    );
    await expect(loadConfig(f)).rejects.toBeInstanceOf(AuthError);
  });

  it("exchanges the code with the verifier, only for its own state, and keeps the token in memory", async () => {
    let body = "";
    const f = discoveryFetch((url, init) => {
      if (url === issuer + "/token") {
        body = String(init?.body);
        return Response.json({ access_token: "at-1", token_type: "Bearer", expires_in: 300, refresh_token: "rt-1" });
      }
    });
    const cfg = await loadConfig(f);
    await authorizationUrl(cfg, "/applications");
    const { state, verifier } = JSON.parse(sessionStorage.getItem("pathops.oidc.pending")!);
    await expect(completeSignIn(`?code=c&state=other`, f)).rejects.toBeInstanceOf(AuthError);
    await authorizationUrl(cfg, "/applications");
    const again = JSON.parse(sessionStorage.getItem("pathops.oidc.pending")!);
    expect(again.state).not.toBe(state);
    expect(await completeSignIn(`?code=c&state=${again.state}`, f)).toBe("/applications");
    const q = new URLSearchParams(body);
    expect(q.get("grant_type")).toBe("authorization_code");
    expect(q.get("code_verifier")).toBe(again.verifier);
    expect(q.get("code_verifier")).not.toBe(verifier);
    expect(q.get("client_id")).toBe("pathops-ui");
    expect(await accessToken(f)).toBe("at-1");
    expect(sessionStorage.getItem("pathops.oidc.pending")).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain("at-1");
    expect(JSON.stringify(sessionStorage)).not.toContain("at-1");
  });

  it("renews an expiring token with the refresh token", async () => {
    let n = 0;
    const f = discoveryFetch((url, init) => {
      if (url === issuer + "/token") {
        n++;
        const q = new URLSearchParams(String(init?.body));
        if (q.get("grant_type") === "refresh_token") {
          expect(q.get("refresh_token")).toBe("rt-1");
          return Response.json({ access_token: "at-2", token_type: "bearer", expires_in: 300 });
        }
        return Response.json({ access_token: "at-1", token_type: "Bearer", expires_in: 10, refresh_token: "rt-1" });
      }
    });
    await authorizationUrl(await loadConfig(f), "/");
    const { state } = JSON.parse(sessionStorage.getItem("pathops.oidc.pending")!);
    await completeSignIn(`?code=c&state=${state}`, f);
    expect(await accessToken(f)).toBe("at-2");
    expect(n).toBe(2);
  });

  it("keeps the return path on this origin", () => {
    expect(safeReturn("//evil.example/x")).toBe("/");
    expect(safeReturn("https://evil.example")).toBe("/");
    expect(safeReturn("/auth/callback?code=x")).toBe("/");
    expect(safeReturn("/applications/a")).toBe("/applications/a");
  });
});
