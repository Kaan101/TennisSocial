"use client";

import type { HomePayload } from "@club/types";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { useResource } from "@/lib/use-resource";

type Feed = { data: HomePayload["activity"] };

export default function ActivityPage() {
  const { data, error, loading, reload } = useResource<Feed>("/activity?limit=40");
  if (loading) return <LoadingBlock label="Akış yükleniyor" />;
  if (error || !data) return <ErrorState message={error ?? "Akış açılmadı"} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <PageHeader title="Akış" />
      <p className="text-sm text-muted">Maç, turnuva ve merdiven. Bir üye akışını gizlediyse satırı burada görünmez.</p>
      {data.data.length === 0 ? (
        <EmptyState title="Akış sakin" body="Görünebilir bir hareket yok. Gizlilik ayarın yalnızca kendi satırlarını etkiler." />
      ) : (
        data.data.map((item) => {
          const body = (
            <>
              <p className="text-sm font-semibold text-court">{item.actorName}</p>
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-muted">{item.body}</p>
              <p className="mt-1 text-xs text-muted">{new Date(item.createdAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</p>
            </>
          );
          return item.link ? (
            <Link key={item.id} href={item.link} className="block rounded-3xl border border-line bg-surface p-4">
              {body}
            </Link>
          ) : (
            <article key={item.id} className="rounded-3xl border border-line bg-surface p-4">
              {body}
            </article>
          );
        })
      )}
    </div>
  );
}
