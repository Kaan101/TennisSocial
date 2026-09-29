"use client";

import type { AuthUser } from "@club/types";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  offline: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  offline: false,
  refresh: async () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<{ user: AuthUser }>("/auth/me").then(
      (data) => {
        if (cancelled) return;
        setUser(data.user);
        setOffline(false);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setUser(null);
        setOffline(err instanceof TypeError);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tick]);

  async function refresh() {
    setTick((value) => value + 1);
  }

  return <AuthContext.Provider value={{ user, loading, offline, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
