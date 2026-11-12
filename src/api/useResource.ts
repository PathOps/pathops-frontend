import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, SigningIn, useApi } from "./client";

export interface Resource<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  reload: () => void;
}

// useResource reads path and reloads it on demand. While pollWhile(data)
// holds (something is still running), it reads again every pollMs: explicit
// polling of the REST read model, no push channel (Decision 0060 §11).
export function useResource<T>(path: string | null, opts: { pollMs?: number; pollWhile?: (d: T) => boolean } = {}): Resource<T> {
  const api = useApi();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  const pollWhile = useRef(opts.pollWhile);
  pollWhile.current = opts.pollWhile;

  useEffect(() => {
    if (path === null) return;
    let live = true;
    setLoading(true);
    api
      .get<T>(path)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (live && !(e instanceof SigningIn)) setError(e);
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [api, path, tick]);

  useEffect(() => {
    if (!data || !pollWhile.current || !pollWhile.current(data)) return;
    const t = setTimeout(() => setTick((n) => n + 1), opts.pollMs ?? 5000);
    return () => clearTimeout(t);
  }, [data, opts.pollMs]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload };
}

export const running = (status: string | undefined) => status === "RUNNING" || status === "PENDING";
