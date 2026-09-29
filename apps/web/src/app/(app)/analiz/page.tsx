"use client";

import Link from "next/link";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { useResource } from "@/lib/use-resource";

type Analytics = {
  memberCount: number;
  activePlayers: number;
  matchesLast30Days: number;
  openChallenges: number;
  tournaments: { id: string; name: string; registered: number; cap: number | null; fill: number | null }[];
};

const cards = [
  ["memberCount", "Üye"],
  ["activePlayers", "Aktif oyuncu"],
  ["matchesLast30Days", "Son 30 gün maç"],
  ["openChallenges", "Açık defi"],
] as const;

export default function AnalyticsPage() {
  const { data, error, loading, reload } = useResource<Analytics>("/analytics");
  if (loading) return <LoadingBlock label="Kulüp özeti yükleniyor" />;
  if (error || !data) return <ErrorState message={error ?? "Özet açılmadı"} onRetry={reload} />;
  return (
    <div className="space-y-5">
      <PageHeader title="Kulüp özeti" />
      <p className="text-sm text-muted">Yalnızca yönetici ve kulüp sorumlusu görür.</p>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(([key, label]) => (
          <div key={key} className="rounded-3xl border border-line bg-surface p-4">
            <p className="text-2xl font-semibold">{data[key]}</p>
            <p className="text-sm text-muted">{label}</p>
          </div>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="font-semibold">Turnuva doluluk</h2>
        {data.tournaments.length === 0 ? (
          <p className="text-sm text-muted">Açık veya süren turnuva yok.</p>
        ) : (
          data.tournaments.map((tournament) => (
            <Link key={tournament.id} href={`/turnuvalar/${tournament.id}`} className="block rounded-3xl border border-line bg-surface p-4">
              <p className="font-semibold">{tournament.name}</p>
              <p className="text-sm text-muted">
                {tournament.registered}
                {tournament.cap ? ` / ${tournament.cap}` : ""} kayıt
                {tournament.fill !== null ? ` · %${tournament.fill}` : ""}
              </p>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
