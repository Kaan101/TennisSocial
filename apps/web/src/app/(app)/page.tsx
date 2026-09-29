"use client";

import type { HomePayload } from "@club/types";
import Link from "next/link";
import { PlayerCard } from "@/components/player-card";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/states";
import { useResource } from "@/lib/use-resource";

const statLinks = [
  { key: "availableToday", label: "Bugün müsait", href: "/oyuncular?availableToday=true" },
  { key: "upcomingMatches", label: "Yaklaşan maçlar", href: "/oyna" },
  { key: "openChallenges", label: "Açık defiler", href: "/defiler" },
  { key: "activeTournaments", label: "Aktif turnuvalar", href: "/turnuvalar" },
] as const;

export default function HomePage() {
  const { data, error, loading, reload } = useResource<HomePayload>("/home");
  if (loading) return <LoadingBlock label="Ana sayfa yükleniyor" />;
  if (error || !data) return <ErrorState message={error ?? "Ana sayfa açılmadı"} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <section className="court-hero -mx-4 rounded-b-[2rem] px-5 pt-2 pb-8 text-white">
        <p className="text-sm text-white/70">{data.dateLabel}</p>
        <h1 className="mt-1 text-3xl font-semibold">Merhaba, {data.greetingName}</h1>
      </section>
      <div className="-mt-10 grid grid-cols-2 gap-3">
        {statLinks.map((item) => (
          <Link key={item.key} href={item.href} className="rounded-3xl border border-line bg-surface p-4">
            <p className="text-2xl font-semibold">{data.stats[item.key]}</p>
            <p className="text-sm text-muted">{item.label}</p>
          </Link>
        ))}
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Bugün kimler müsait?</h2>
          <Link href="/oyuncular?availableToday=true" className="text-sm font-semibold text-court">Tümü</Link>
        </div>
        {data.availableToday.length === 0 ? (
          <EmptyState title="Kort sessiz" body="Bugün müsait görünen kimse yok. Müsaitliğini işaretle, seni de listeye ekleyelim." />
        ) : (
          data.availableToday.map((player) => <PlayerCard key={player.id} player={player} />)
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Yaklaşan maçlar</h2>
          <a href="/api/bff/calendar.ics" className="text-sm font-semibold text-court">Takvime indir</a>
        </div>
        {data.upcomingMatches.length === 0 ? (
          <EmptyState title="Takvim boş" body="Yeni bir maç kur veya gelen defiyi kabul et." />
        ) : (
          data.upcomingMatches.map((match) => (
            <Link key={match.id} href={`/maclar/${match.id}`} className="block rounded-3xl border border-line bg-surface p-4">
              <p className="font-semibold">{match.formatLabel} · {match.court ?? "Kort belirsiz"}</p>
              <p className="text-sm text-muted">{new Date(match.scheduledAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</p>
              <p className="text-sm">{match.players.map((player) => player.name).join(" · ")}</p>
            </Link>
          ))
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Yeni challenge’lar</h2>
          <Link href="/defiler" className="text-sm font-semibold text-court">Tümü</Link>
        </div>
        {data.newChallenges.length === 0 ? (
          <EmptyState title="Açık defi yok" body="Rakibine saat öner, kortu birlikte seçin." />
        ) : (
          data.newChallenges.map((challenge) => (
            <Link key={challenge.id} href={`/defiler/${challenge.id}`} className="block rounded-3xl border border-line bg-surface p-4">
              <p className="font-semibold">{challenge.challenger.name} → {challenge.recipient.name}</p>
              <p className="text-sm text-muted">{challenge.status === "COUNTERED" ? "Karşı teklif" : "Bekliyor"} · {challenge.proposedDate} {challenge.proposedTime}</p>
            </Link>
          ))
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Bu akşam sana uygun</h2>
        {data.suggested.length === 0 ? (
          <EmptyState title="Öneri yok" body="Profilin ve müsaitliğin dolunca burada rakipler belirecek." />
        ) : (
          data.suggested.map((item) => (
            <div key={item.user.id} className="space-y-1">
              <PlayerCard player={item.user} />
              <p className="px-2 text-xs text-muted">{item.reasons.join(" · ")}</p>
            </div>
          ))
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Akış</h2>
          <Link href="/akis" className="text-sm font-semibold text-court">Tümü</Link>
        </div>
        {data.activity.length === 0 ? (
          <EmptyState title="Akış sakin" body="Maç, turnuva ve merdiven hareketleri burada görünür." />
        ) : (
          data.activity.map((item) => (
            <article key={item.id} className="rounded-3xl border border-line bg-surface p-4">
              <p className="text-sm font-semibold">{item.actorName}</p>
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-muted">{item.body}</p>
            </article>
          ))
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Turnuvalar</h2>
        {data.tournaments.length === 0 ? (
          <EmptyState title="Açık turnuva yok" body="Kayıtlar başlayınca burada görünecek." />
        ) : (
          data.tournaments.map((tournament) => (
            <Link key={tournament.id} href={`/turnuvalar/${tournament.id}`} className="block rounded-3xl border border-line bg-surface p-4">
              <p className="font-semibold">{tournament.name}</p>
              <p className="text-sm text-muted">{tournament.startDate}{tournament.location ? ` · ${tournament.location}` : ""}</p>
            </Link>
          ))
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Kulüp duyuruları</h2>
          <Link href="/duyurular" className="text-sm font-semibold text-court">Tümü</Link>
        </div>
        {data.announcements.length === 0 ? (
          <EmptyState title="Duyuru yok" body="Kulüp bir not bıraktığında burada görünecek." />
        ) : (
          data.announcements.map((item) => (
            <article key={item.id} className="rounded-3xl border border-line bg-surface p-4">
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-muted">{item.body}</p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
