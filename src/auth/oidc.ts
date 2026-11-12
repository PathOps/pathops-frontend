// OIDC Authorization Code + PKCE (S256) at the Cell's Dex for the UI's public
// client (Decision 0060). The issuer and client come from the Tenant CP's
// discovery (/.well-known/pathops) at the same origin: the image is the same
// for every Cell.
//
// Tokens live in memory only (never localStorage or sessionStorage): a reload
// signs in again, which Dex's login session (shared with the CLI and Forgejo)
// answers without a password. Only the PKCE verifier, state and return path
// cross the redirect, in sessionStorage, and are removed when it returns.

export const CALLBACK_PATH = "/auth/callback";
const PENDING_KEY = "pathops.oidc.pending";
// Renew a little before expiry (Dex's tokens live 5 minutes).
const EXPIRY_MARGIN_MS = 30_000;

export interface OidcConfig {
  issuer: string;
  clientId: string;
  scopes: string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface Pending {
  verifier: string;
  state: string;
  returnTo: string;
}

let config: OidcConfig | null = null;
let tokens: Tokens | null = null;
let refreshing: Promise<string> | null = null;

export class AuthError extends Error {}

export function base64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function random(n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return base64url(b);
}

// challenge is the S256 code challenge of verifier (RFC 7636).
export async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function redirectUri(): string {
  return window.location.origin + CALLBACK_PATH;
}

// loadConfig reads the Tenant CP's discovery, then the issuer's.
export async function loadConfig(fetchFn: typeof fetch = fetch): Promise<OidcConfig> {
  if (config) return config;
  const d = await fetchFn("/.well-known/pathops");
  if (!d.ok) throw new AuthError(`the Tenant CP's discovery answered ${d.status}`);
  const doc = await d.json();
  if (!doc.ui?.clientId) throw new AuthError("this Cell has no PathOps UI client");
  const issuer: string = doc.oidc.issuer;
  const o = await fetchFn(issuer + "/.well-known/openid-configuration");
  if (!o.ok) throw new AuthError(`the Cell's Dex discovery answered ${o.status}`);
  const meta = await o.json();
  if (meta.issuer !== issuer) throw new AuthError("the Cell's Dex names another issuer");
  config = {
    issuer,
    clientId: doc.ui.clientId,
    scopes: [...(doc.oidc.scopes ?? ["openid", "profile", "email"]), "offline_access"],
    authorizationEndpoint: meta.authorization_endpoint,
    tokenEndpoint: meta.token_endpoint,
  };
  return config;
}

// authorizationUrl starts a sign-in: it records the pending PKCE state and
// returns the URL to send the browser to.
export async function authorizationUrl(cfg: OidcConfig, returnTo: string): Promise<string> {
  const pending: Pending = { verifier: random(48), state: random(16), returnTo: safeReturn(returnTo) };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const q = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    scope: cfg.scopes.join(" "),
    state: pending.state,
    code_challenge: await challenge(pending.verifier),
    code_challenge_method: "S256",
  });
  return cfg.authorizationEndpoint + "?" + q.toString();
}

// safeReturn keeps a return path on this origin.
export function safeReturn(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith(CALLBACK_PATH) ? path : "/";
}

async function tokenRequest(cfg: OidcConfig, body: Record<string, string>, fetchFn: typeof fetch): Promise<Tokens> {
  const r = await fetchFn(cfg.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, ...body }).toString(),
  });
  if (!r.ok) throw new AuthError(`the token request answered ${r.status}`);
  const t = await r.json();
  if (typeof t.access_token !== "string" || String(t.token_type).toLowerCase() !== "bearer") {
    throw new AuthError("no bearer access token");
  }
  return {
    accessToken: t.access_token,
    refreshToken: typeof t.refresh_token === "string" ? t.refresh_token : undefined,
    expiresAt: Date.now() + (Number(t.expires_in) || 300) * 1000,
  };
}

// completeSignIn handles the callback URL: the state must be the pending
// one; the code is exchanged with the verifier. It returns the return path.
export async function completeSignIn(search: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  const q = new URLSearchParams(search);
  if (q.get("error")) throw new AuthError(`Dex refused the sign-in: ${q.get("error")}`);
  if (!raw) throw new AuthError("no sign-in in progress");
  const pending = JSON.parse(raw) as Pending;
  const code = q.get("code");
  if (!code || q.get("state") !== pending.state) throw new AuthError("the sign-in answer does not match its request");
  const cfg = await loadConfig(fetchFn);
  tokens = await tokenRequest(
    cfg,
    { grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: pending.verifier },
    fetchFn,
  );
  return pending.returnTo;
}

// accessToken returns a current access token, renewed with the refresh token
// when it is about to expire; null when there is none (sign in).
export async function accessToken(fetchFn: typeof fetch = fetch): Promise<string | null> {
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt - EXPIRY_MARGIN_MS) return tokens.accessToken;
  if (!tokens.refreshToken) {
    tokens = null;
    return null;
  }
  if (!refreshing) {
    const refreshToken = tokens.refreshToken;
    refreshing = loadConfig(fetchFn)
      .then((cfg) => tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchFn))
      .then((t) => {
        tokens = { ...t, refreshToken: t.refreshToken ?? refreshToken };
        return tokens.accessToken;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  try {
    return await refreshing;
  } catch {
    tokens = null;
    return null;
  }
}

export function signOut(): void {
  tokens = null;
}

export function signedIn(): boolean {
  return tokens !== null;
}

// resetForTests clears the module state.
export function resetForTests(): void {
  config = null;
  tokens = null;
  refreshing = null;
  sessionStorage.clear();
}
