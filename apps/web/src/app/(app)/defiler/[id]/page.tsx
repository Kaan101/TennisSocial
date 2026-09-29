"use client";

import type { ChallengeSummary } from "@club/types";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorState, LoadingBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

export default function ChallengeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useResource<ChallengeSummary>(`/challenges/${params.id}`);
  const [counter, setCounter] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "Defi açılmadı"} onRetry={reload} />;

  async function act(path: string, body?: unknown) {
    setMessage(null);
    try {
      const result = await api<{ matchId?: string }>(`/challenges/${data!.id}/${path}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (result.matchId) router.push(`/maclar/${result.matchId}`);
      else await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "İşlem olmadı");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{data.formatLabel} defisi</h1>
      <p>{data.challenger.name} → {data.recipient.name}</p>
      <p className="text-sm text-muted">Öneri: {data.proposedDate} {data.proposedTime}{data.court ? ` · ${data.court}` : ""}</p>
      {data.counterDate ? <p className="text-sm">Karşı teklif: {data.counterDate} {data.counterTime} {data.counterNote ?? ""}</p> : null}
      {data.note ? <p className="text-sm">{data.note}</p> : null}
      {data.matchId ? <Button onClick={() => router.push(`/maclar/${data.matchId}`)}>Maça git</Button> : null}
      {data.canRespond ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => act("accept")}>Kabul et</Button>
          <Button variant="outline" onClick={() => act("decline")}>Reddet</Button>
          <Button variant="ghost" onClick={() => setCounter((value) => !value)}>Başka saat</Button>
        </div>
      ) : null}
      {counter ? (
        <form
          className="space-y-2 rounded-3xl bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void act("counter", { proposedDate: form.get("date"), proposedTime: form.get("time"), note: form.get("note") });
          }}
        >
          <Label htmlFor="date">Yeni tarih</Label>
          <Input id="date" name="date" type="date" required />
          <Label htmlFor="time">Yeni saat</Label>
          <Input id="time" name="time" type="time" required />
          <Input name="note" placeholder="Kısa not" />
          <Button type="submit">Öner</Button>
        </form>
      ) : null}
      {data.canCancel ? <Button variant="outline" onClick={() => act("cancel")}>İptal et</Button> : null}
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
