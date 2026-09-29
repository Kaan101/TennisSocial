"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

type Ladder = { id: string; name: string; description: string | null; playerCount: number; maxRankSpan: number };
type Detail = {
  id: string;
  name: string;
  description: string | null;
  maxRankSpan: number;
  players: { userId: string; name: string; rank: number; points: number }[];
  history: { id: string; name: string; previousRank: number | null; newRank: number; reason: string | null; createdAt: string }[];
};

export default function LadderPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useResource<{ data: Ladder[] }>("/ladders");
  const [selected, setSelected] = useState<string | null>(null);
  const activeId = selected ?? data?.data[0]?.id ?? null;
  const detail = useResource<Detail>(activeId ? `/ladders/${activeId}` : null);
  if (loading) return <LoadingBlock label="Merdiven yükleniyor" />;
  if (error || !data) return <ErrorState message={error ?? "Merdiven açılmadı"} onRetry={reload} />;
  const mine = detail.data?.players.find((player) => player.userId === user?.id);
  return (
    <div className="space-y-4">
      <PageHeader title="Merdiven" />
      {data.data.length === 0 ? <EmptyState title="Merdiven yok" body="Kulüp bir merdiven açınca burada durur." /> : null}
      {data.data.map((ladder) => (
        <button key={ladder.id} type="button" onClick={() => setSelected(ladder.id)} className="block w-full rounded-3xl border border-line bg-surface p-4 text-left">
          <p className="font-semibold">{ladder.name}</p>
          <p className="text-sm text-muted">{ladder.playerCount} oyuncu · en fazla {ladder.maxRankSpan} sıra yukarı</p>
        </button>
      ))}
      {detail.loading ? <LoadingBlock label="Sıra yükleniyor" /> : null}
      {detail.data ? (
        <>
          <p className="text-sm text-muted">{detail.data.description}</p>
          <ol className="space-y-2">
            {detail.data.players.map((player) => {
              const canChallenge = Boolean(mine && player.rank < mine.rank && mine.rank - player.rank <= detail.data!.maxRankSpan);
              return (
                <li key={player.userId} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
                  <span>{player.rank}. {player.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted">{player.points} puan</span>
                    {canChallenge ? (
                      <Link href={`/defiler/yeni?recipientId=${player.userId}&ladderId=${detail.data!.id}`} className="font-semibold text-court">Defi et</Link>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
          <section className="space-y-2">
            <h2 className="font-semibold">Geçmiş</h2>
            {detail.data.history.length === 0 ? <EmptyState title="Hareket yok" body="Sonuç işlenince sıra değişiklikleri burada durur." /> : null}
            {detail.data.history.map((row) => (
              <p key={row.id} className="rounded-2xl border border-line px-4 py-3 text-sm">
                {row.name}: {row.previousRank ?? "–"} → {row.newRank}
                {row.reason ? ` · ${row.reason}` : ""}
              </p>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
