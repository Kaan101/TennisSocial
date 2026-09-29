"use client";

import type { ChallengeSummary, MatchSummary } from "@club/types";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { useResource } from "@/lib/use-resource";

function calendarLink(match: MatchSummary): string {
  const start = new Date(match.scheduledAt);
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "Tenis maçı",
    dates: `${stamp(start)}/${stamp(end)}`,
  });
  if (match.court) params.set("location", match.court);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function PlayPage() {
  const matches = useResource<{ data: MatchSummary[] }>("/matches?scope=mine");
  const challenges = useResource<{ data: ChallengeSummary[] }>("/challenges?scope=all");
  if (matches.loading || challenges.loading) return <LoadingBlock />;
  if (matches.error || challenges.error) {
    return <ErrorState message={matches.error ?? challenges.error ?? "Oyun alanı açılmadı"} onRetry={() => { void matches.reload(); void challenges.reload(); }} />;
  }
  const upcoming = (matches.data?.data ?? []).filter((match) => match.status === "SCHEDULED");
  const open = (challenges.data?.data ?? []).filter((item) => item.status === "PENDING" || item.status === "COUNTERED");
  return (
    <div className="space-y-6">
      <PageHeader title="Oyna" action={<Link href="/profil/musaitlik" className="text-sm font-semibold text-court">Müsaitlik</Link>} />
      <div className="grid grid-cols-2 gap-3">
        <Link href="/maclar/yeni" className="rounded-3xl bg-court px-4 py-5 font-semibold text-white">Yeni maç</Link>
        <Link href="/defiler/yeni" className="rounded-3xl bg-court-deep px-4 py-5 font-semibold text-white">Yeni defi</Link>
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Yaklaşan maçların</h2>
          <a href="/api/bff/calendar.ics" className="text-sm font-semibold text-court">Takvime indir</a>
        </div>
        {upcoming.length === 0 ? <EmptyState title="Maç yok" body="Bir rakip seçip kortu ayarla." /> : upcoming.map((match, index) => (
          <div key={match.id} className="rounded-3xl border border-line bg-surface p-4">
            <Link href={`/maclar/${match.id}`} className="block">
              <p className="font-semibold">{match.formatLabel}</p>
              <p className="text-sm text-muted">{new Date(match.scheduledAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })} · {match.court ?? "Kort yok"}</p>
            </Link>
            {index === 0 ? (
              <a className="mt-2 inline-block text-sm font-semibold text-court" href={calendarLink(match)} target="_blank" rel="noreferrer">
                Takvime ekle
              </a>
            ) : null}
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Açık defiler</h2>
        {open.length === 0 ? <EmptyState title="Defi yok" body="Gelen teklifler burada bekler." /> : open.map((item) => (
          <Link key={item.id} href={`/defiler/${item.id}`} className="block rounded-3xl border border-line bg-surface p-4">
            <p className="font-semibold">{item.challenger.name} → {item.recipient.name}</p>
            <p className="text-sm text-muted">{item.canRespond ? "Yanıtın bekleniyor" : "Karşı taraf düşünüyor"}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
