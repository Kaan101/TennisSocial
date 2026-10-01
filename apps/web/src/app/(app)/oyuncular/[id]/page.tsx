"use client";

import { telLink, waLink } from "@club/shared";
import type { UserDetail } from "@club/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MatchStats } from "@/components/match-stats";
import { Avatar } from "@/components/player-card";
import { SkillRadar } from "@/components/radar";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";
import { useState } from "react";

export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, error, loading, reload } = useResource<UserDetail>(`/users/${params.id}`);
  const [note, setNote] = useState<string | null>(null);
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "Profil açılmadı"} onRetry={reload} />;
  const name = `${data.profile.firstName} ${data.profile.lastName}`.trim();
  const whatsappHref =
    data.permissions.canWhatsapp && data.profile.whatsapp
      ? waLink(data.profile.whatsapp, data.profile.firstName)
      : null;
  const callHref = data.permissions.canCall && data.profile.phone ? telLink(data.profile.phone) : null;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar first={data.profile.firstName} last={data.profile.lastName} photo={data.profile.photoUrl} className="h-16 w-16 text-lg" />
        <div>
          <h1 className="text-2xl font-semibold">{name}</h1>
          <p className="text-sm text-muted">{data.profile.statusMessage}</p>
          <p className="text-sm text-muted">{[data.profile.district, data.profile.city].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {data.profile.statusNote ? <p className="rounded-2xl bg-surface px-4 py-3 text-sm">{data.profile.statusNote}</p> : null}
      {data.profile.bio ? <p className="text-sm leading-6">{data.profile.bio}</p> : null}
      <div className="flex flex-wrap gap-2">
        {data.permissions.canChallenge ? (
          <Link href={`/defiler/yeni?recipientId=${data.id}`} className="rounded-full bg-court px-4 py-2 text-sm font-semibold text-white">Defi</Link>
        ) : null}
        {whatsappHref ? (
          <a className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold" href={whatsappHref}>WhatsApp</a>
        ) : null}
        {callHref ? (
          <a className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold" href={callHref}>Ara</a>
        ) : null}
        {user && user.id !== data.id ? (
          <Link href={`/karsilastir?b=${data.id}`} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold">Karşılaştır</Link>
        ) : null}
        {user && user.id !== data.id ? (
          <button
            type="button"
            className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold"
            onClick={async () => {
              try {
                await api("/friends", { method: "POST", body: JSON.stringify({ userId: data.id }) });
                setNote("Arkadaşlık isteği gönderildi.");
              } catch (err) {
                setNote(err instanceof Error ? err.message : "İstek gönderilemedi");
              }
            }}
          >
            Arkadaş ekle
          </button>
        ) : null}
      </div>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
      <section className="rounded-3xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Tenis</h2>
        {data.tennis ? (
          <>
            <p className="mt-1 text-sm text-muted">
              {data.tennis.overallLabel}
              {data.tennis.ntrp ? ` · NTRP ${data.tennis.ntrp}` : ""} · {data.tennis.playPreferenceLabel}
              {data.tennis.backhandType ? ` · ${data.tennis.backhandType} backhand` : ""}
            </p>
            <SkillRadar series={[{ name, color: "#0f6e49", data: data.tennis.radar }]} />
          </>
        ) : (
          <EmptyState title="Tenis profili gizli" body="Bu üye vuruş bilgilerini paylaşmıyor." />
        )}
      </section>
      {data.rackets[0] ? (
        <section className="rounded-3xl border border-line bg-surface p-4 text-sm">
          <h2 className="font-semibold">Raket</h2>
          <p className="mt-1">{data.rackets[0].brand} {data.rackets[0].model}</p>
          <p className="text-muted">{[data.rackets[0].headSize, data.rackets[0].weight, data.rackets[0].stringName, data.rackets[0].tension].filter(Boolean).join(" · ")}</p>
        </section>
      ) : null}
      {data.stats ? <MatchStats stats={data.stats} /> : <p className="text-sm text-muted">Maç geçmişi gizli.</p>}
    </div>
  );
}
