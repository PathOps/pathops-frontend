// OIDC Authorization Code + PKCE (S256) at the Cell's Dex for the UI's public
// client (Decision 0060). The issuer and client come from the Tenant CP's
// discovery (/.well-known/pathops) at the same origin: the image is the same
// for every Cell.
//
// Tokens live in memory only (never localStorage or sessionStorage): a reload
// signs in again, which Dex's login session (shared with the CLI and Forgejo)
// answers without a password. Only the PKCE verifier, state and return path
// cross the redirect, in sessionStorage, and are removed when it returns.
//
// Signing out ends both sessions: the tokens are dropped first, then the
// browser goes to Dex's end_session_endpoint (RP-Initiated Logout), which
// ends the Cell's login session and returns to SIGNED_OUT_PATH.

export const CALLBACK_PATH = "/auth/callback";
export const SIGNED_OUT_PATH = "/signed-out";
const PENDING_KEY = "pathops.oidc.pending";
// Renew a little before expiry (Dex's tokens live 5 minutes).
const EXPIRY_MARGIN_MS = 30_000;

export interface OidcConfig {
  issuer: string;
  clientId: string;
  scopes: string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
  // endSessionEndpoint is Dex's RP-Initiated Logout endpoint; null when the
  // provider has none.
  endSessionEndpoint: string | null;
  // eventsUrl is the Cell's pathops-events (live updates, Decision 0063),
  // https://<host>; null when the Cell has none.
  eventsUrl: string | null;
}

interface Tokens {
  accessToken: string;
  refreshToken?: string;
  // idToken names this browser's Dex session to its logout (id_token_hint).
  idToken?: string;
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
// Listeners of sign-in and sign-out (the live connection follows them).
const signedInListeners = new Set<(signedIn: boolean) => void>();

function setTokens(t: Tokens | null) {
  const was = tokens !== null;
  tokens = t;
  if (was !== (t !== null)) signedInListeners.forEach((l) => l(t !== null));
}

// onSignedIn calls listener with true when the page signs in and false when
// it signs out; it returns the unsubscribe.
export function onSignedIn(listener: (signedIn: boolean) => void): () => void {
  signedInListeners.add(listener);
  return () => {
    signedInListeners.delete(listener);
  };
}

// tokenExpiry is when the current access token expires (ms), null without one.
export function tokenExpiry(): number | null {
  return tokens?.expiresAt ?? null;
}

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
  if (!d.ok) throw new AuthError(`PathOps sign-in is unavailable (discovery answered ${d.status})`);
  const doc = await d.json();
  if (!doc.ui?.clientId) throw new AuthError("PathOps sign-in is not configured for the web UI");
  const issuer: string = doc.oidc.issuer;
  const o = await fetchFn(issuer + "/.well-known/openid-configuration");
  if (!o.ok) throw new AuthError(`the identity provider is unavailable (discovery answered ${o.status})`);
  const meta = await o.json();
  if (meta.issuer !== issuer) throw new AuthError("the identity provider names another issuer");
  config = {
    issuer,
    clientId: doc.ui.clientId,
    scopes: [...(doc.oidc.scopes ?? ["openid", "profile", "email"]), "offline_access"],
    authorizationEndpoint: meta.authorization_endpoint,
    tokenEndpoint: meta.token_endpoint,
    endSessionEndpoint: httpsUrl(meta.end_session_endpoint),
    eventsUrl: origin(doc.events?.url),
  };
  return config;
}

// origin is v when it is an https origin (no path), else null.
function origin(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.origin === v ? v : null;
  } catch {
    return null;
  }
}

// httpsUrl is v when it is an https URL, else null.
function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
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
    idToken: typeof t.id_token === "string" ? t.id_token : undefined,
    expiresAt: Date.now() + (Number(t.expires_in) || 300) * 1000,
  };
}

// completeSignIn handles the callback URL: the state must be the pending
// one; the code is exchanged with the verifier. It returns the return path.
export async function completeSignIn(search: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  const q = new URLSearchParams(search);
  if (q.get("error")) throw new AuthError(`the identity provider refused the sign-in: ${q.get("error")}`);
  if (!raw) throw new AuthError("no sign-in in progress");
  const pending = JSON.parse(raw) as Pending;
  const code = q.get("code");
  if (!code || q.get("state") !== pending.state) throw new AuthError("the sign-in answer does not match its request");
  const cfg = await loadConfig(fetchFn);
  const t = await tokenRequest(
    cfg,
    { grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: pending.verifier },
    fetchFn,
  );
  setTokens(t);
  return pending.returnTo;
}

// accessToken returns a current access token, renewed with the refresh token
// when it is about to expire; null when there is none (sign in).
export async function accessToken(fetchFn: typeof fetch = fetch): Promise<string | null> {
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt - EXPIRY_MARGIN_MS) return tokens.accessToken;
  if (!tokens.refreshToken) {
    setTokens(null);
    return null;
  }
  if (!refreshing) {
    const refreshToken = tokens.refreshToken;
    refreshing = loadConfig(fetchFn)
      .then((cfg) => tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchFn))
      .then((t) => {
        // A sign-out while the request ran stays signed out.
        if (!tokens) throw new AuthError("signed out");
        tokens = { ...t, refreshToken: t.refreshToken ?? refreshToken, idToken: t.idToken ?? tokens.idToken };
        return tokens.accessToken;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  try {
    return await refreshing;
  } catch {
    setTokens(null);
    return null;
  }
}

// signOut drops this page's tokens (the UI's own session).
export function signOut(): void {
  setTokens(null);
}

// endSession signs this page out at once and returns where the browser goes
// next to end the Cell's login session too: Dex's logout, naming this
// session (id_token_hint) and coming back to the signed-out page; Dex asks
// the user to confirm when it cannot match the hint to its session. Without
// a logout endpoint at the provider, the signed-out page directly.
export function endSession(fetchFn: typeof fetch = fetch): Promise<string> {
  const idToken = tokens?.idToken;
  signOut();
  return loadConfig(fetchFn)
    .then((cfg) => {
      if (!cfg.endSessionEndpoint) return SIGNED_OUT_PATH;
      if (!idToken) return cfg.endSessionEndpoint;
      const q = new URLSearchParams({ id_token_hint: idToken, post_logout_redirect_uri: window.location.origin + SIGNED_OUT_PATH });
      return cfg.endSessionEndpoint + "?" + q.toString();
    })
    .catch(() => SIGNED_OUT_PATH);
}

export function signedIn(): boolean {
  return tokens !== null;
}

// resetForTests clears the module state.
export function resetForTests(): void {
  config = null;
  tokens = null;
  refreshing = null;
  signedInListeners.clear();
  sessionStorage.clear();
}
