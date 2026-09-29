"use client";

import { LEVEL_LABELS, OVERALL_LEVELS, PLAY_LABELS, PLAY_PREFERENCES } from "@club/shared";
import type { PageMeta, PlayerCard as Card } from "@club/types";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PlayerCard } from "@/components/player-card";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Input, Select } from "@/components/ui/input";
import { useResource } from "@/lib/use-resource";

function SearchBody() {
  const params = useSearchParams();
  const router = useRouter();
  const query = params.toString();
  const { data, error, loading, reload } = useResource<{ data: Card[]; meta: PageMeta }>(`/players/search?${query}`);
  const [text, setText] = useState(params.get("q") ?? "");

  function update(next: Record<string, string>) {
    const url = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) url.set(key, value);
      else url.delete(key);
    }
    router.replace(`/oyuncular?${url.toString()}`);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Oyuncular" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: text });
        }}
      >
        <label htmlFor="q" className="sr-only">Oyuncu ara</label>
        <Input id="q" value={text} onChange={(event) => setText(event.target.value)} placeholder="İsim, Orta+, forehand 8+, Wilson Blade" />
      </form>
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label="Seviye" value={params.get("overallLevel") ?? ""} onChange={(event) => update({ overallLevel: event.target.value })}>
          <option value="">Tüm seviyeler</option>
          {OVERALL_LEVELS.map((level) => <option key={level} value={level}>{LEVEL_LABELS[level]}</option>)}
        </Select>
        <Select aria-label="Oyun tipi" value={params.get("playPreference") ?? ""} onChange={(event) => update({ playPreference: event.target.value })}>
          <option value="">Tekler / çiftler</option>
          {PLAY_PREFERENCES.map((item) => <option key={item} value={item}>{PLAY_LABELS[item]}</option>)}
        </Select>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          ["availableToday", "Bugün müsait"],
          ["availableWeekend", "Hafta sonu"],
          ["activeOnly", "Yalnızca aktif"],
        ].map(([key, label]) => {
          const on = params.get(key) === "true";
          return (
            <button key={key} type="button" onClick={() => update({ [key]: on ? "" : "true" })} className={`rounded-full px-3 py-1.5 font-semibold ${on ? "bg-court text-white" : "bg-surface border border-line"}`}>
              {label}
            </button>
          );
        })}
      </div>
      <Input aria-label="Semt" placeholder="Semt" defaultValue={params.get("district") ?? ""} onBlur={(event) => update({ district: event.target.value })} />
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && data?.data.length === 0 ? (
        <EmptyState title="Kimse yok" body="Filtreyi gevşet veya aramayı sadeleştir." />
      ) : null}
      <div className="space-y-3">
        {data?.data.map((player) => <PlayerCard key={player.id} player={player} />)}
      </div>
    </div>
  );
}

export default function PlayersPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <SearchBody />
    </Suspense>
  );
}
