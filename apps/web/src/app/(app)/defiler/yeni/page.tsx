"use client";

import { SET_FORMAT_LABELS, SET_FORMATS } from "@club/shared";
import type { PlayerCard as Card } from "@club/types";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingBlock, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";

function NewChallengeBody() {
  const params = useSearchParams();
  const router = useRouter();
  const [recipientId, setRecipientId] = useState(params.get("recipientId") ?? "");
  const ladderId = params.get("ladderId");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          const created = await api<{ id: string }>("/challenges", {
            method: "POST",
            body: JSON.stringify({
              format: form.get("format"),
              recipientId,
              proposedDate: form.get("date"),
              proposedTime: form.get("time"),
              court: form.get("court") || null,
              setFormat: form.get("setFormat"),
              note: form.get("note") || null,
              ladderId,
            }),
          });
          router.push(`/defiler/${created.id}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Defi gönderilemedi");
        }
      }}
    >
      <PageHeader title={ladderId ? "Merdiven defisi" : "Yeni defi"} />
      {ladderId ? <p className="text-sm text-muted">Bu defi merdiven aralığına göre kontrol edilir. Kazanırsan sıra değişir.</p> : null}
      <div className="flex gap-2">
        <Input aria-label="Rakip ara" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rakip adı" />
        <Button type="button" variant="outline" onClick={async () => {
          const found = await api<{ data: Card[] }>(`/players/search?q=${encodeURIComponent(query)}`);
          setResults(found.data);
        }}>Ara</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {results.map((player) => (
          <button type="button" key={player.id} onClick={() => setRecipientId(player.id)} className={`rounded-full px-3 py-1 text-sm ${recipientId === player.id ? "bg-court text-white" : "bg-surface border border-line"}`}>
            {player.firstName} {player.lastName}
          </button>
        ))}
      </div>
      {recipientId ? <p className="text-xs text-muted">Seçilen oyuncu hazır.</p> : <p className="text-sm text-clay">Bir rakip seç.</p>}
      <div>
        <Label htmlFor="format">Format</Label>
        <Select id="format" name="format" defaultValue="SINGLE"><option value="SINGLE">Tekler</option><option value="DOUBLE">Çiftler</option></Select>
      </div>
      <div><Label htmlFor="date">Tarih</Label><Input id="date" name="date" type="date" required /></div>
      <div><Label htmlFor="time">Saat</Label><Input id="time" name="time" type="time" required /></div>
      <div><Label htmlFor="court">Kort</Label><Input id="court" name="court" placeholder="Kort 1" /></div>
      <div>
        <Label htmlFor="setFormat">Set</Label>
        <Select id="setFormat" name="setFormat" defaultValue="BEST_OF_3">
          {SET_FORMATS.map((item) => <option key={item} value={item}>{SET_FORMAT_LABELS[item]}</option>)}
        </Select>
      </div>
      <div><Label htmlFor="note">Not</Label><Textarea id="note" name="note" /></div>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={!recipientId}>Defi gönder</Button>
    </form>
  );
}

export default function NewChallengePage() {
  return <Suspense fallback={<LoadingBlock />}><NewChallengeBody /></Suspense>;
}
