"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

export function useResource<T>(path: string | null) {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loadGeneration = useRef(0);

  useEffect(() => {
    if (!path) return;
    const generation = ++loadGeneration.current;
    let cancelled = false;
    api<T>(path).then(
      (next) => {
        if (cancelled || generation !== loadGeneration.current) return;
        setDataState(next);
        setError(null);
        setLoadedPath(path);
      },
      (err: unknown) => {
        if (cancelled || generation !== loadGeneration.current) return;
        setDataState(null);
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

  const setData = useCallback(
    (next: T) => {
      if (!path) return;
      loadGeneration.current += 1;
      setDataState(next);
      setError(null);
      setLoadedPath(path);
    },
    [path],
  );

  const loading = Boolean(path) && loadedPath !== path;
  return { data: loadedPath === path ? data : null, error: loadedPath === path ? error : null, loading, reload, setData };
}
