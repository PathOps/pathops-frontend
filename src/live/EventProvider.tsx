import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadConfig } from "../auth/oidc";
import { isLiveEvent, type LiveEvent, type Topic } from "./topics";

// EventProvider holds the page's one live-update stream (Decision 0063): a
// single EventSource to the Cell's pathops-events, whatever views are open.
// Views subscribe to it (useLive) with the Topic they show; REST stays the
// source of truth, so an invalidation only makes a view read REST again.
//
// EventSource reconnects by itself after a dropped stream. A refused one
// (pathops-events down, or no session there) is opened again after a
// backoff; without a session there, the browser signs in to it once (the
// Cell's Dex answers from its login session) and comes back to this page.
// After any reconnection every live view reads REST again: invalidations
// sent while it was away are not replayed.

// LiveStatus: "off" (the Cell has no live updates), "connecting" (first
// connection), "live", "reconnecting" (the stream dropped; trying again) or
// "disconnected" (it cannot sign in there; a reload is the fallback).
export type LiveStatus = "off" | "connecting" | "live" | "reconnecting" | "disconnected";

// Signal is an invalidation, or "resync" after a reconnection (every live
// view reads again).
export type Signal = LiveEvent | "resync";

// Connection is the browser's side of a stream (EventSource, or a test's).
export interface Connection {
  readonly readyState: number;
  onopen: ((ev: Event) => unknown) | null;
  onmessage: ((ev: MessageEvent) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
  close(): void;
}

// LiveSource is how the provider reaches pathops-events.
export interface LiveSource {
  // base is pathops-events' URL (null: none).
  base(): Promise<string | null>;
  open(url: string): Connection;
  // signedIn: true with a session there, false without, null unreachable.
  signedIn(base: string): Promise<boolean | null>;
  // signIn leaves the page for pathops-events' sign-in, back to it after.
  signIn(base: string): void;
}

const CLOSED = 2;
const SIGN_IN_KEY = "pathops.live.signin";
// A sign-in there is tried at most once in this time (no redirect loop).
const SIGN_IN_INTERVAL_MS = 5 * 60_000;

export const browserSource: LiveSource = {
  async base() {
    try {
      return (await loadConfig()).eventsUrl;
    } catch {
      return null;
    }
  },
  open(url) {
    return new EventSource(url, { withCredentials: true });
  },
  async signedIn(base) {
    try {
      const r = await fetch(base + "/api/v1/session", { credentials: "include" });
      if (r.status === 401) return false;
      return r.ok ? true : null;
    } catch {
      return null;
    }
  },
  signIn(base) {
    window.location.replace(base + "/login?return=" + encodeURIComponent(window.location.href));
  },
};

// endLiveSession signs out of pathops-events too (its session cookie is
// HttpOnly, on its host): a sign-out of the UI ends the live updates. It
// resolves once the request is sent; keepalive lets it outlive the page.
export function endLiveSession(source: Pick<LiveSource, "base"> = browserSource): Promise<void> {
  return source.base().then(
    (base) => {
      if (base) void fetch(base + "/logout", { method: "POST", credentials: "include", keepalive: true }).catch(() => undefined);
    },
    () => undefined,
  );
}

// mayTrySignIn: no sign-in there was started recently from this tab.
function mayTrySignIn(now: number): boolean {
  try {
    const last = Number(sessionStorage.getItem(SIGN_IN_KEY) ?? 0);
    if (now - last < SIGN_IN_INTERVAL_MS) return false;
    sessionStorage.setItem(SIGN_IN_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

interface Live {
  status: LiveStatus;
  subscribe(listener: (s: Signal) => void): () => void;
}

const LiveContext = createContext<Live>({ status: "off", subscribe: () => () => {} });

export function EventProvider({
  children,
  source = browserSource,
  backoffMs = [2_000, 5_000, 10_000, 30_000],
}: {
  children: ReactNode;
  source?: LiveSource;
  backoffMs?: number[];
}) {
  const [status, setStatus] = useState<LiveStatus>("off");
  const listeners = useRef(new Set<(s: Signal) => void>());

  useEffect(() => {
    let stopped = false;
    let conn: Connection | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connected = false; // a stream was open before
    let attempt = 0;
    const dispatch = (s: Signal) => listeners.current.forEach((l) => l(s));

    const retry = () => {
      setStatus(connected ? "reconnecting" : "connecting");
      timer = setTimeout(connect, backoffMs[Math.min(attempt, backoffMs.length - 1)]);
      attempt++;
    };

    const refused = async (base: string) => {
      const signed = await source.signedIn(base);
      if (stopped) return;
      if (signed === false) {
        if (mayTrySignIn(Date.now())) {
          source.signIn(base);
          return;
        }
        setStatus("disconnected");
        return;
      }
      retry();
    };

    async function connect() {
      const base = await source.base();
      if (stopped) return;
      if (!base) {
        setStatus("off");
        return;
      }
      setStatus(connected ? "reconnecting" : "connecting");
      const c = source.open(base + "/api/v1/events");
      conn = c;
      c.onopen = () => {
        attempt = 0;
        setStatus("live");
        if (connected) dispatch("resync");
        connected = true;
      };
      c.onmessage = (ev) => {
        let data: unknown;
        try {
          data = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (isLiveEvent(data)) dispatch(data);
      };
      c.onerror = () => {
        if (stopped || conn !== c) return;
        if (c.readyState !== CLOSED) {
          // The stream dropped; EventSource reconnects by itself.
          setStatus("reconnecting");
          return;
        }
        // Refused (an HTTP error): find out why, then open again.
        c.close();
        conn = null;
        void refused(base);
      };
    }

    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      conn?.close();
    };
    // One stream for the provider's lifetime (its source does not change).
  }, [source]);

  const subscribe = useCallback((listener: (s: Signal) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const value = useMemo<Live>(() => ({ status, subscribe }), [status, subscribe]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

// useLiveStatus is the stream's state (for the header's note).
export function useLiveStatus(): LiveStatus {
  return useContext(LiveContext).status;
}

// useLive calls onChange when an invalidation of topic arrives, and after a
// reconnection. Without a topic it does nothing.
export function useLive(topic: Topic | undefined, onChange: () => void) {
  const { subscribe } = useContext(LiveContext);
  const latest = useRef({ topic, onChange });
  latest.current = { topic, onChange };
  useEffect(
    () =>
      subscribe((s) => {
        const { topic, onChange } = latest.current;
        if (topic && (s === "resync" || topic(s))) onChange();
      }),
    [subscribe],
  );
}

// LiveNote is a discreet note in the header while live updates are not
// flowing: nothing when they are (or when the Cell has none).
export function LiveNote() {
  const status = useLiveStatus();
  if (status === "reconnecting")
    return (
      <span className="live-note" role="status">
        Reconnecting…
      </span>
    );
  if (status === "disconnected")
    return (
      <span className="live-note" role="status" title="Reload the page to try again">
        Live updates disconnected
      </span>
    );
  return null;
}
