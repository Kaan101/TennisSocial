"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useClub } from "@/lib/club";

export default function ClubDefinitionPage() {
  const { club, ready, selectClub, reload } = useClub();
  const [clubName, setClubName] = useState("");
  const [newClub, setNewClub] = useState("");

  useEffect(() => {
    setClubName(club?.name ?? "");
  }, [club?.id, club?.name]);

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

  if (!ready) return null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <h1 className="text-sm font-semibold">Kulüp tanımı</h1>
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
