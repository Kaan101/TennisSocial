"use client";

import { SET_FORMAT_LABELS, SET_FORMATS } from "@club/shared";
import type { PlayerCard as Card } from "@club/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function NewMatchPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [format, setFormat] = useState<"SINGLE" | "DOUBLE">("SINGLE");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Card[]>([]);
  const [opponent, setOpponent] = useState<string>("");
  const [partner, setPartner] = useState<string>("");
  const [opponents, setOpponents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const players = format === "SINGLE"
          ? [{ userId: user.id, side: "A" }, { userId: opponent, side: "B" }]
          : [
              { userId: user.id, side: "A" },
              { userId: partner, side: "A" },
              ...opponents.slice(0, 2).map((id) => ({ userId: id, side: "B" as const })),
            ];
        try {
          const match = await api<{ id: string }>("/matches", {
            method: "POST",
            body: JSON.stringify({
              format,
              scheduledDate: form.get("date"),
              scheduledTime: form.get("time"),
              court: form.get("court") || null,
              setFormat: form.get("setFormat"),
              note: form.get("note") || null,
              players,
            }),
          });
          router.push(`/maclar/${match.id}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Maç kurulamadı");
        }
      }}
    >
      <PageHeader title="Yeni maç" />
      <div className="flex gap-2">
        <Button type="button" variant={format === "SINGLE" ? "default" : "outline"} onClick={() => setFormat("SINGLE")}>Tekler</Button>
        <Button type="button" variant={format === "DOUBLE" ? "default" : "outline"} onClick={() => setFormat("DOUBLE")}>Çiftler</Button>
      </div>
      <div className="flex gap-2">
        <Input aria-label="Oyuncu ara" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Oyuncu ara" />
        <Button type="button" variant="outline" onClick={async () => {
          const found = await api<{ data: Card[] }>(`/players/search?q=${encodeURIComponent(query)}`);
          setResults(found.data.filter((player) => player.id !== user.id));
        }}>Ara</Button>
      </div>
      <div className="space-y-2">
        {results.map((player) => (
          <div key={player.id} className="flex items-center justify-between rounded-2xl bg-surface px-3 py-2 text-sm">
            <span>{player.firstName} {player.lastName}</span>
            <span className="flex gap-2">
              {format === "SINGLE" ? (
                <button type="button" className="font-semibold text-court" onClick={() => setOpponent(player.id)}>Rakip</button>
              ) : (
                <>
                  <button type="button" className="font-semibold text-court" onClick={() => setPartner(player.id)}>Partner</button>
                  <button type="button" className="font-semibold text-clay" onClick={() => setOpponents((ids) => ids.includes(player.id) ? ids : [...ids, player.id].slice(0, 2))}>Rakip</button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      <div><Label htmlFor="date">Tarih</Label><Input id="date" name="date" type="date" required /></div>
      <div><Label htmlFor="time">Saat</Label><Input id="time" name="time" type="time" required /></div>
      <div><Label htmlFor="court">Kort</Label><Input id="court" name="court" /></div>
      <div>
        <Label htmlFor="setFormat">Set</Label>
        <Select id="setFormat" name="setFormat" defaultValue="BEST_OF_3">
          {SET_FORMATS.map((item) => <option key={item} value={item}>{SET_FORMAT_LABELS[item]}</option>)}
        </Select>
      </div>
      <div><Label htmlFor="note">Not</Label><Textarea id="note" name="note" /></div>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <Button type="submit" className="w-full">Maçı kur</Button>
    </form>
  );
}
