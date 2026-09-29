"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  joined: boolean;
  managed: boolean;
  members: { userId: string; role: string; name: string }[];
  events: { id: string; title: string; startsAt: string; location: string | null }[];
  matches: { id: string; scheduledAt: string; status: string; players: { name: string }[] }[];
  tournaments: { id: string; name: string; status: string; startDate: string }[];
};

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, error, loading, reload } = useResource<GroupDetail>(`/groups/${params.id}`);
  const [message, setMessage] = useState<string | null>(null);
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "Grup açılmadı"} onRetry={reload} />;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{data.name}</h1>
        <p className="text-sm text-muted">{data.description}</p>
      </div>
      {!data.joined && data.visibility === "PUBLIC" ? (
        <Button
          onClick={async () => {
            try {
              await api(`/groups/${data.id}/join`, { method: "POST" });
              setMessage("Gruba katıldın.");
              await reload();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Katılınamadı");
            }
          }}
        >
          Katıl
        </Button>
      ) : null}
      {message ? <p className="text-sm">{message}</p> : null}
      <section>
        <h2 className="font-semibold">Üyeler</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.members.map((member) => <li key={member.userId}>{member.name}{member.role === "MANAGER" ? " · sorumlu" : ""}</li>)}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Etkinlikler</h2>
        {data.events.length === 0 ? <EmptyState title="Etkinlik yok" body="Grup sorumlusu bir buluşma ekleyebilir." /> : data.events.map((event) => (
          <p key={event.id} className="rounded-2xl bg-surface p-3 text-sm">{event.title} · {new Date(event.startsAt).toLocaleString("tr-TR")}</p>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Maçlar</h2>
        {data.matches.length === 0 ? <EmptyState title="Maç yok" body="Bu grubun maçı henüz yok." /> : data.matches.map((match) => (
          <p key={match.id} className="rounded-2xl bg-surface p-3 text-sm">{match.players.map((player) => player.name).join(" · ")}</p>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Turnuvalar</h2>
        {data.tournaments.length === 0 ? <EmptyState title="Turnuva yok" body="Bağlı turnuva olduğunda burada görünür." /> : data.tournaments.map((item) => (
          <p key={item.id} className="rounded-2xl bg-surface p-3 text-sm">{item.name}</p>
        ))}
      </section>
    </div>
  );
}
