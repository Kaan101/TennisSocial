"use client";

import { useRouter } from "next/navigation";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

type Note = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

export default function NotificationsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useResource<{ data: Note[]; meta: { unread: number } }>("/notifications");
  if (loading) return <LoadingBlock label="Bildirimler yükleniyor" />;
  if (error || !data) return <ErrorState message={error ?? "Bildirimler açılmadı"} onRetry={reload} />;
  return (
    <div className="space-y-3">
      <PageHeader
        title="Bildirimler"
        action={<button type="button" className="text-sm font-semibold text-court" onClick={async () => { await api("/notifications/read-all", { method: "POST" }); await reload(); }}>Tümünü okundu say</button>}
      />
      {data.meta.unread > 0 ? <p className="text-sm text-muted">{data.meta.unread} okunmamış</p> : null}
      {data.data.length === 0 ? <EmptyState title="Bildirim yok" body="Defi, maç ve turnuva haberleri burada birikir. WhatsApp kendiliğinden gitmez." /> : null}
      {data.data.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={async () => {
            await api(`/notifications/${item.id}/read`, { method: "POST" });
            if (item.link) router.push(item.link);
            else await reload();
          }}
          className={`block w-full rounded-3xl border border-line p-4 text-left ${item.readAt ? "bg-paper" : "bg-surface"}`}
        >
          <p className="font-semibold">{item.title}</p>
          <p className="text-sm text-muted">{item.body}</p>
        </button>
      ))}
    </div>
  );
}
