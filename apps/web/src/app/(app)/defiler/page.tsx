"use client";

import type { ChallengeSummary } from "@club/types";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { useResource } from "@/lib/use-resource";

export default function ChallengesPage() {
  const { data, error, loading, reload } = useResource<{ data: ChallengeSummary[] }>("/challenges?scope=all");
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "Defiler açılmadı"} onRetry={reload} />;
  return (
    <div className="space-y-3">
      <PageHeader title="Defiler" action={<Link href="/defiler/yeni" className="text-sm font-semibold text-court">Yeni</Link>} />
      {data.data.length === 0 ? <EmptyState title="Defi yok" body="Bir oyuncuya saat önererek başla." /> : null}
      {data.data.map((item) => (
        <Link key={item.id} href={`/defiler/${item.id}`} className="block rounded-3xl border border-line bg-surface p-4">
          <p className="font-semibold">{item.challenger.name} → {item.recipient.name}</p>
          <p className="text-sm text-muted">{item.formatLabel} · {item.proposedDate} {item.proposedTime}</p>
          <p className="text-xs text-court">{item.status}</p>
        </Link>
      ))}
    </div>
  );
}
