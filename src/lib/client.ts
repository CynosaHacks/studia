"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; formData?: FormData } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body || opts.formData ? "POST" : "GET"),
    headers: opts.formData ? undefined : { "Content-Type": "application/json" },
    body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tick = useRef(0);

  const refresh = useCallback(() => {
    if (!path) return;
    const id = ++tick.current;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (id === tick.current) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (id === tick.current) setError(e.message);
      })
      .finally(() => {
        if (id === tick.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, error, loading, refresh, setData };
}
