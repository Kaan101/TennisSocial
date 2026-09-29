"use client";

import { canManageTournaments } from "@club/shared";
import type { PageMeta } from "@club/types";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

type Row = {
  id: string;
  name: string;
  statusLabel: string;
  formatLabel: string;
  divisionLabel: string;
  startDate: string;
  location: string | null;
  playerCount: number;
  waitingCount: number;
};

export default function TournamentsPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useResource<{ data: Row[]; meta: PageMeta }>("/tournaments");
  if (loading) return <LoadingBlock label="Turnuvalar yükleniyor" />;
  if (error || !data) return <ErrorState message={error ?? "Turnuvalar açılmadı"} onRetry={reload} />;
  return (
    <div className="space-y-3">
      <PageHeader
        title="Turnuvalar"
        action={user && canManageTournaments(user.role) ? <Link href="/turnuvalar/yeni" className="text-sm font-semibold text-court">Yeni</Link> : null}
      />
      {data.data.length === 0 ? <EmptyState title="Turnuva yok" body="Kulüp bir turnuva açtığında burada görünecek." /> : null}
      {data.data.map((item) => (
        <Link key={item.id} href={`/turnuvalar/${item.id}`} className="block rounded-3xl border border-line bg-surface p-4">
          <p className="font-semibold">{item.name}</p>
          <p className="text-sm text-muted">{item.formatLabel} · {item.divisionLabel}</p>
          <p className="text-sm text-muted">{item.statusLabel} · {item.startDate} · {item.playerCount} oyuncu{item.waitingCount ? ` · ${item.waitingCount} yedek` : ""}{item.location ? ` · ${item.location}` : ""}</p>
        </Link>
      ))}
    </div>
  );
}
