"use client";

import { useState } from "react";
import { ClubDefinition } from "@/components/club-definition";
import { CourtDefinition } from "@/components/court-definition";
import { Input, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useClub } from "@/lib/club";
import { useResource } from "@/lib/use-resource";

type LadderRow = { id: string; name: string; clubId: string | null; clubName: string | null };

export default function SettingsPage() {
  const { clubs, clubId, ready } = useClub();
  const ladders = useResource<{ data: LadderRow[] }>(ready ? "/ladders" : null);
  const [name, setName] = useState("");
  const [chosenClub, setChosenClub] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const clubValue = chosenClub ?? clubId ?? "";

  async function defineLadder(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !clubValue) return;
    setMessage(null);
    try {
      await api("/ladders", { method: "POST", body: JSON.stringify({ name: trimmed, clubId: clubValue }) });
      setName("");
      setMessage("Merdiven kaydedildi.");
      await ladders.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Merdiven kaydedilemedi");
    }
  }

  if (!ready) return null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-8">
      <h1 className="text-sm font-semibold">Ayarlar</h1>
      <section className="flex w-full min-w-0 flex-col gap-3">
        <h2 className="text-sm font-semibold">Merdiven</h2>
        <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => void defineLadder(event)}>
          <Input aria-label="Merdiven adı" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ad" className="h-9 min-w-0 flex-1" />
          <Select aria-label="Kulüp" value={clubValue} onChange={(event) => setChosenClub(event.target.value)} className="h-9 w-40">
            {clubs.length === 0 ? <option value="">Kulüp yok</option> : null}
            {clubs.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
          <button type="submit" className="court-press shrink-0 rounded-md border border-line px-2 py-1 text-xs">Kaydet</button>
        </form>
        {message ? <p className="text-sm">{message}</p> : null}
        <ul className="flex flex-col gap-1">
          {(ladders.data?.data ?? []).map((ladder) => (
            <li key={ladder.id} className="text-sm">
              {ladder.name}
              {ladder.clubName ? ` · ${ladder.clubName}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <ClubDefinition nested />
      <CourtDefinition nested />
    </div>
  );
}
