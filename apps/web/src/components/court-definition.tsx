"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useClub } from "@/lib/club";

type DefinedCourt = {
  id: string;
  name: string;
  kind: "BALLOON" | "OUTDOOR";
};

export function CourtDefinition({ nested = false }: { nested?: boolean }) {
  const { clubId, ready } = useClub();
  const [courts, setCourts] = useState<DefinedCourt[]>([]);
  const [courtName, setCourtName] = useState("");
  const [kind, setKind] = useState<"BALLOON" | "OUTDOOR">("OUTDOOR");
  const Title = nested ? "h2" : "h1";

  useEffect(() => {
    if (!clubId) {
      setCourts([]);
      return;
    }
    let cancel = false;
    api<{ data: DefinedCourt[] }>(`/courts?club=${clubId}`)
      .then((data) => {
        if (!cancel) setCourts(data.data);
      })
      .catch(() => {
        if (!cancel) setCourts([]);
      });
    return () => {
      cancel = true;
    };
  }, [clubId]);

  async function createCourt() {
    const name = courtName.trim();
    if (!clubId || !name) return;
    try {
      const created = await api<DefinedCourt>("/courts", {
        method: "POST",
        body: JSON.stringify({ name, clubId, kind }),
      });
      setCourtName("");
      setCourts((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name, "tr")));
    } catch {
      return;
    }
  }

  async function removeCourt(id: string) {
    try {
      await api(`/courts/${id}`, { method: "DELETE" });
      setCourts((current) => current.filter((court) => court.id !== id));
    } catch {
      return;
    }
  }

  if (!ready) return null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <Title className="text-sm font-semibold">Kort tanımı</Title>
      {clubId ? (
        <>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createCourt();
            }}
          >
            <Input aria-label="Kort" value={courtName} onChange={(event) => setCourtName(event.target.value)} className="h-9 min-w-0 flex-1" />
            <button
              type="button"
              aria-pressed={kind === "BALLOON"}
              onClick={() => setKind("BALLOON")}
              className={`court-press rounded-md border px-2 py-1 text-xs ${kind === "BALLOON" ? "border-ink font-semibold" : "border-line"}`}
            >
              Kapalı
            </button>
            <button
              type="button"
              aria-pressed={kind === "OUTDOOR"}
              onClick={() => setKind("OUTDOOR")}
              className={`court-press rounded-md border px-2 py-1 text-xs ${kind === "OUTDOOR" ? "border-ink font-semibold" : "border-line"}`}
            >
              Kort
            </button>
            <button type="submit" className="court-press rounded-md border border-line px-2 py-1 text-xs">Ekle</button>
          </form>
          <ul className="flex flex-col gap-1">
            {courts.map((court) => (
              <li key={court.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {court.name}
                  {court.kind === "BALLOON" ? " · Kapalı" : ""}
                </span>
                <button type="button" onClick={() => void removeCourt(court.id)} className="court-press shrink-0 text-xs">Sil</button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
