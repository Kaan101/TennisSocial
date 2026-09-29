"use client";

import type { MatchSummary } from "@club/types";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ErrorState, LoadingBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const { data, error, loading, reload } = useResource<MatchSummary>(`/matches/${params.id}`);
  const [message, setMessage] = useState<string | null>(null);
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "Maç açılmadı"} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{data.formatLabel}</h1>
      <p className="text-sm text-muted">{new Date(data.scheduledAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} · {data.court ?? "Kort yok"}</p>
      <ul className="space-y-1 text-sm">
        {data.players.map((player) => <li key={player.userId}>{player.side === "A" ? "A" : "B"} · {player.name}</li>)}
      </ul>
      {data.score ? <p className="text-lg font-semibold">{data.score}</p> : null}
      {data.canRecordResult ? (
        <form
          className="space-y-2 rounded-3xl bg-surface p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await api(`/matches/${data.id}/result`, {
                method: "PATCH",
                body: JSON.stringify({ score: form.get("score"), winnerSide: form.get("winnerSide") }),
              });
              setMessage("Sonuç işlendi.");
              await reload();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Sonuç kaydedilemedi");
            }
          }}
        >
          <Label htmlFor="score">Skor</Label>
          <Input id="score" name="score" placeholder="6-4 6-3" required />
          <Label htmlFor="winnerSide">Kazanan taraf</Label>
          <Select id="winnerSide" name="winnerSide" defaultValue="A">
            <option value="A">A tarafı</option>
            <option value="B">B tarafı</option>
          </Select>
          <Button type="submit">Sonucu kaydet</Button>
        </form>
      ) : null}
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
