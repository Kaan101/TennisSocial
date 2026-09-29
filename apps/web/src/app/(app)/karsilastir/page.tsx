"use client";

import type { PlayerCard as Card, UserDetail } from "@club/types";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SkillRadar } from "@/components/radar";
import { EmptyState, LoadingBlock } from "@/components/states";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

function CompareBody() {
  const params = useSearchParams();
  const { user } = useAuth();
  const leftId = params.get("a") || user?.id || "";
  const initialRight = params.get("b") || "";
  const [rightId, setRightId] = useState(initialRight);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Card[]>([]);
  const left = useResource<UserDetail>(leftId ? `/users/${leftId}` : null);
  const right = useResource<UserDetail>(rightId ? `/users/${rightId}` : null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const found = await api<{ data: Card[] }>(`/players/search?q=${encodeURIComponent(query)}`);
    setResults(found.data);
  }

  const series = [left.data, right.data]
    .filter((item): item is UserDetail => Boolean(item?.tennis))
    .map((item, index) => ({
      name: item.profile.firstName,
      color: index === 0 ? "#0f6e49" : "#c45c2e",
      data: item.tennis!.radar,
    }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Karşılaştır</h1>
      <p className="text-sm text-muted">İki oyuncunun vuruşunu aynı grafikte gör.</p>
      <form onSubmit={search} className="flex gap-2">
        <Input aria-label="Rakip ara" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rakip adı" />
        <button className="rounded-full bg-court px-4 text-sm font-semibold text-white" type="submit">Ara</button>
      </form>
      <div className="flex flex-wrap gap-2">
        {results.map((player) => (
          <button key={player.id} type="button" onClick={() => setRightId(player.id)} className="rounded-full border border-line bg-surface px-3 py-1 text-sm">
            {player.firstName} {player.lastName}
          </button>
        ))}
      </div>
      {left.loading || right.loading ? <LoadingBlock /> : null}
      {series.length < 2 ? (
        <EmptyState title="İki profil seç" body="Grafik, tenis profili açık olan iki oyuncuyla çizilir." />
      ) : (
        <div className="rounded-3xl border border-line bg-surface p-3">
          <SkillRadar series={series} />
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <CompareBody />
    </Suspense>
  );
}
