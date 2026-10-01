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

export default function CourtDefinitionPage() {
  const { club, clubId, ready, selectClub, reload } = useClub();
  const [clubName, setClubName] = useState("");
  const [newClub, setNewClub] = useState("");
  const [courts, setCourts] = useState<DefinedCourt[]>([]);
  const [courtName, setCourtName] = useState("");
  const [kind, setKind] = useState<"BALLOON" | "OUTDOOR">("OUTDOOR");

  useEffect(() => {
    setClubName(club?.name ?? "");
  }, [club?.id, club?.name]);

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

  async function saveClubName() {
    const name = clubName.trim();
    if (!club || !name || name === club.name) return;
    try {
      await api(`/clubs/${club.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      await reload();
    } catch {
      setClubName(club.name);
    }
  }

  async function setFlag(field: "hasRestaurant" | "hasFitness", value: boolean) {
    if (!club || club[field] === value) return;
    try {
      await api(`/clubs/${club.id}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) });
      await reload();
    } catch {
      return;
    }
  }

  async function createClub() {
    const name = newClub.trim();
    if (!name) return;
    try {
      const created = await api<{ id: string }>("/clubs", { method: "POST", body: JSON.stringify({ name }) });
      setNewClub("");
      selectClub(created.id);
      await reload();
    } catch {
      return;
    }
  }

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
      <h1 className="text-sm font-semibold">Kort tanımı</h1>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void createClub();
        }}
      >
        <Input aria-label="Kulüp" value={newClub} onChange={(event) => setNewClub(event.target.value)} className="h-9" />
        <button type="submit" className="court-press shrink-0 rounded-md border border-line px-2 py-1 text-xs">Ekle</button>
      </form>
      {club ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span>Kulüp</span>
            <Input
              value={clubName}
              onChange={(event) => setClubName(event.target.value)}
              onBlur={() => void saveClubName()}
              className="h-9"
            />
          </label>
          <FlagRow label="Restoran" value={club.hasRestaurant} onChange={(value) => void setFlag("hasRestaurant", value)} />
          <FlagRow label="Fitness" value={club.hasFitness} onChange={(value) => void setFlag("hasFitness", value)} />
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

function FlagRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20">{label}</span>
      <button type="button" aria-pressed={value} onClick={() => onChange(true)} className={`court-press rounded-md border px-2 py-1 text-xs ${value ? "border-ink font-semibold" : "border-line"}`}>Evet</button>
      <button type="button" aria-pressed={!value} onClick={() => onChange(false)} className={`court-press rounded-md border px-2 py-1 text-xs ${!value ? "border-ink font-semibold" : "border-line"}`}>Hayır</button>
    </div>
  );
}
