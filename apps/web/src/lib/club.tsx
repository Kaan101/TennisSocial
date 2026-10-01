"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

export type Club = {
  id: string;
  name: string;
  hasRestaurant: boolean;
  hasFitness: boolean;
};

const STORAGE_KEY = "kort-club";

type ClubState = {
  clubs: Club[];
  clubId: string | null;
  club: Club | null;
  ready: boolean;
  selectClub: (id: string) => void;
  reload: () => Promise<void>;
};

const ClubContext = createContext<ClubState>({
  clubs: [],
  clubId: null,
  club: null,
  ready: false,
  selectClub: () => undefined,
  reload: async () => undefined,
});

export function ClubProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setClubs([]);
      setClubId(null);
      setReady(true);
      return;
    }
    const data = await api<{ data: Club[] }>("/clubs");
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const next = data.data.find((item) => item.id === stored)?.id ?? data.data[0]?.id ?? null;
    setClubs(data.data);
    setClubId(next);
    if (next) window.localStorage.setItem(STORAGE_KEY, next);
    else window.localStorage.removeItem(STORAGE_KEY);
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    let cancel = false;
    setReady(false);
    reload().catch(() => {
      if (cancel) return;
      setClubs([]);
      setClubId(null);
      setReady(true);
    });
    return () => {
      cancel = true;
    };
  }, [loading, reload]);

  function selectClub(id: string) {
    setClubId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }

  const club = clubs.find((item) => item.id === clubId) ?? null;

  return <ClubContext.Provider value={{ clubs, clubId, club, ready, selectClub, reload }}>{children}</ClubContext.Provider>;
}

export function useClub(): ClubState {
  return useContext(ClubContext);
}
