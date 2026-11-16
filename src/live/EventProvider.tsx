import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io } from "socket.io-client";
import { accessToken, loadConfig, onSignedIn, tokenExpiry } from "../auth/oidc";
import { isLiveEvent, type LiveEvent, type Topic } from "./topics";

// EventProvider holds the page's one live connection (Decision 0063): a
// single Socket.IO connection to the Cell's pathops-events, whatever views are
// open. Views subscribe to it (useLive) with the Topic they show; REST stays
// the source of truth, so an invalidation only makes a view read REST again.
//
// It is authenticated by the PathOps token the UI already holds for the
// Tenant CP, in the handshake's auth payload (never a URL or cookie): there is
// no second sign-in. Before the token expires the provider renews it and
// hands the new one to pathops-events ("reauth"); otherwise pathops-events
// closes the connection at the token's expiry and Socket.IO reconnects with
// the current token. A sign-out closes it for good. Socket.IO's ping/pong and
// reconnection replace any heartbeat of ours; after any reconnection every
// live view reads REST again: invalidations sent while it was away are not
// replayed.

// LiveStatus: "off" (the Cell has no live updates, or signed out),
// "connecting" (first connection), "live", "reconnecting" (the connection
// dropped; trying again) or "disconnected" (pathops-events keeps refusing the
// token; a reload is the fallback).
export type LiveStatus = "off" | "connecting" | "live" | "reconnecting" | "disconnected";

// Signal is an invalidation, or "resync" after a reconnection (every live
// view reads again).
export type Signal = LiveEvent | "resync";

// LiveSocket is the part of a Socket.IO client socket the provider uses (a
// test's fake, or socket.io-client's).
export interface LiveSocket {
  // active: Socket.IO reconnects by itself (false after a refusal by the
  // server, or a disconnect()).
  readonly active: boolean;
  on(event: "connect", fn: () => void): void;
  on(event: "disconnect", fn: (reason: string) => void): void;
  on(event: "connect_error", fn: (err: Error) => void): void;
  on(event: "invalidate", fn: (data: unknown) => void): void;
  // onReconnecting: Socket.IO tries again after a dropped connection.
  onReconnecting(fn: () => void): void;
  emit(event: "reauth", data: { token: string }, ack: (answer: { ok?: boolean; error?: string }) => void): void;
  connect(): void;
  disconnect(): void;
}

// Auth is Socket.IO's auth callback: it is asked on every (re)connection.
export type Auth = (cb: (data: { token: string }) => void) => void;

// LiveSource is how the provider reaches pathops-events and the token.
export interface LiveSource {
  // base is pathops-events' URL (null: none).
  base(): Promise<string | null>;
  open(base: string, auth: Auth): LiveSocket;
  // token is the current PathOps token, renewed when it is about to expire
  // (null: signed out); expiry when it expires (ms).
  token(): Promise<string | null>;
  expiry(): number | null;
  onSignedIn(listener: (signedIn: boolean) => void): () => void;
}

export const browserSource: LiveSource = {
  async base() {
    try {
      return (await loadConfig()).eventsUrl;
    } catch {
      return null;
    }
  },
  open(base, auth) {
    const s = io(base, {
      transports: ["websocket"],
      auth,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });
    return {
      get active() {
        return s.active;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on: (event: string, fn: (...a: any[]) => void) => s.on(event, fn),
      onReconnecting: (fn) => s.io.on("reconnect_attempt", fn),
      emit: (event, data, ack) => s.emit(event, data, ack),
      connect: () => s.connect(),
      disconnect: () => s.disconnect(),
    } as LiveSocket;
  },
  token: () => accessToken(),
  expiry: () => tokenExpiry(),
  onSignedIn: (listener) => onSignedIn(listener),
};

// The token is renewed and handed over this long before it expires (the
// renewal happens within accessToken's own 30 s margin).
const REAUTH_BEFORE_MS = 20_000;
// After this many refusals in a row the provider gives up (the note says so).
const MAX_REFUSALS = 4;

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
    let signedOut = false;
    let sock: LiveSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let reauth: ReturnType<typeof setTimeout> | undefined;
    let connected = false; // a connection was open before
    let refusals = 0;
    const dispatch = (s: Signal) => listeners.current.forEach((l) => l(s));
    const ended = () => stopped || signedOut;

    // Socket.IO asks on every (re)connection: always the current token.
    const auth: Auth = (cb) => {
      void source.token().then((t) => cb({ token: t ?? "" }));
    };

    const scheduleReauth = () => {
      clearTimeout(reauth);
      const exp = source.expiry();
      if (exp === null) return;
      reauth = setTimeout(
        () => {
          void source.token().then((t) => {
            if (ended() || !t || !sock) return;
            sock.emit("reauth", { token: t }, (answer) => {
              // Refused: pathops-events closes the connection at the old
              // token's expiry and Socket.IO reconnects with the current one.
              if (answer?.ok) scheduleReauth();
            });
          });
        },
        Math.max(5_000, exp - Date.now() - REAUTH_BEFORE_MS),
      );
    };

    const start = async () => {
      const base = await source.base();
      if (ended()) return;
      if (!base) {
        setStatus("off");
        return;
      }
      setStatus("connecting");
      const s = source.open(base, auth);
      sock = s;
      s.on("connect", () => {
        refusals = 0;
        setStatus("live");
        if (connected) dispatch("resync");
        connected = true;
        scheduleReauth();
      });
      s.on("disconnect", () => {
        clearTimeout(reauth);
        if (ended()) return;
        setStatus("reconnecting");
        // A close by the server's own decision is not retried by Socket.IO.
        if (!s.active) retry = setTimeout(() => !ended() && s.connect(), backoffMs[0]);
      });
      s.onReconnecting(() => {
        if (!ended()) setStatus(connected ? "reconnecting" : "connecting");
      });
      s.on("connect_error", (err) => {
        // Socket.IO retries a failed transport by itself; a refusal by
        // pathops-events (unauthorized, unavailable...) is retried here.
        if (ended() || s.active) return;
        refusals++;
        if (err.message === "unauthorized" && refusals >= MAX_REFUSALS) {
          setStatus("disconnected");
          return;
        }
        setStatus(connected ? "reconnecting" : "connecting");
        retry = setTimeout(() => !ended() && s.connect(), backoffMs[Math.min(refusals - 1, backoffMs.length - 1)]);
      });
      s.on("invalidate", (data) => {
        if (isLiveEvent(data)) dispatch(data);
      });
    };

    // A sign-out closes the connection and nothing reconnects it without a
    // token; a sign-in on this page connects it again.
    const offSignedIn = source.onSignedIn((signed) => {
      if (stopped) return;
      if (!signed) {
        signedOut = true;
        clearTimeout(retry);
        clearTimeout(reauth);
        sock?.disconnect();
        setStatus("off");
        return;
      }
      if (signedOut) {
        signedOut = false;
        refusals = 0;
        if (sock) {
          setStatus("connecting");
          sock.connect();
        } else void start();
      }
    });

    void start();
    return () => {
      stopped = true;
      offSignedIn();
      clearTimeout(retry);
      clearTimeout(reauth);
      sock?.disconnect();
    };
    // One connection for the provider's lifetime (its source does not change).
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

// useLiveStatus is the connection's state (for the header's note).
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
