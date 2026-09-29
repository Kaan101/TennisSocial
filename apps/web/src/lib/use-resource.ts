"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>(path).then(
      (next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
        setLoadedPath(path);
      },
      (err: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(err instanceof Error ? err.message : "Bir hata oluştu");
        setLoadedPath(path);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  const reload = useCallback(async () => {
    setTick((value) => value + 1);
  }, []);

  const loading = Boolean(path) && loadedPath !== path;
  return { data: loadedPath === path ? data : null, error: loadedPath === path ? error : null, loading, reload, setData };
}
