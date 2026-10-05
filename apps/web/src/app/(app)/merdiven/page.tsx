"use client";

import type { PlayerCard } from "@club/types";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/player-card";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/states";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useClub } from "@/lib/club";
import { useResource } from "@/lib/use-resource";

type Phase = "pending" | "accepted" | "scheduled" | "rejected" | "expired" | "resolved";

type LadderOffer = {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  phase: Phase;
  createdAt: string;
  respondedAt: string | null;
  acceptedAt: string | null;
  scheduledAt: string | null;
};

type LadderPlayer = {
  userId: string;
  name: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  rank: number;
  lastMove: "UP" | "DOWN" | null;
  lastMoveSteps: number | null;
  passive: boolean;
  challengeRight: number;
  canChallenge: boolean;
  offer: LadderOffer | null;
};

type LadderSummary = {
  playerCount: number;
  activeChallenges: number;
  pendingOffers: number;
  passivePlayers: number;
};

type Ladder = {
  id: string;
  name: string;
  clubId: string | null;
  playerCount: number;
  summary: LadderSummary;
  players: LadderPlayer[];
  offers: LadderOffer[];
};

const BACK = new Set(["a", "ı", "o", "u"]);
const FRONT = new Set(["e", "i", "ö", "ü"]);

const when = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Istanbul",
});

function lastVowel(word: string): string | null {
  const chars = word.toLocaleLowerCase("tr-TR");
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const ch = chars[i] ?? "";
    if (BACK.has(ch) || FRONT.has(ch)) return ch;
  }
  return null;
}

function dative(name: string): string {
  const trimmed = name.trim();
  const vowel = lastVowel(trimmed);
  const last = trimmed.slice(-1).toLocaleLowerCase("tr-TR");
  const endsWithVowel = BACK.has(last) || FRONT.has(last);
  const front = vowel ? FRONT.has(vowel) : false;
  const suffix = endsWithVowel ? (front ? "'ye" : "'ya") : front ? "'e" : "'a";
  return `${trimmed}${suffix}`;
}

function statusText(offer: LadderOffer): string {
  const who = dative(offer.toName);
  if (offer.phase === "pending") return `${who} bekliyor`;
  if (offer.phase === "expired") return `${who} süre aşıldı`;
  if (offer.phase === "accepted") return `${who} kabul edildi`;
  if (offer.phase === "rejected") return `${who} reddedildi`;
  return `${who} planlandı`;
}

function answerText(offer: LadderOffer | null): string {
  if (!offer) return "Henüz yok";
  if (offer.phase === "pending") return "48 saat içinde";
  if (!offer.respondedAt) return "Cevap gelmedi";
  return when.format(new Date(offer.respondedAt));
}

function matchDateText(offer: LadderOffer | null): string {
  if (!offer) return "—";
  if (offer.phase === "pending") return "Kabul sonrası";
  if (offer.scheduledAt) return when.format(new Date(offer.scheduledAt));
  if (offer.phase === "accepted") return "72 saat içinde belirlenecek";
  return "—";
}

function dateBounds(acceptedAt: string): { min: string; max: string } {
  const accepted = new Date(acceptedAt);
  const min = new Date(accepted);
  min.setUTCHours(0, 0, 0, 0);
  const end = accepted.getTime() + 7 * 24 * 60 * 60 * 1000;
  const last = new Date(end);
  last.setUTCHours(12, 0, 0, 0);
  if (last.getTime() > end) last.setUTCDate(last.getUTCDate() - 1);
  return { min: min.toISOString().slice(0, 10), max: last.toISOString().slice(0, 10) };
}

const actionClass = "court-press rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-60";

export default function LadderPage() {
  const { user } = useAuth();
  const { clubId, ready } = useClub();
  const { data: ladderData, error: ladderError, loading: ladderLoading, reload: reloadLadders } = useResource<{ data: Ladder[] }>(clubId ? `/ladders?clubId=${encodeURIComponent(clubId)}` : null);
  const ensured = useRef<string | null>(null);
  const [ensureTick, setEnsureTick] = useState(0);
  const [ensureError, setEnsureError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PlayerCard[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resultFor, setResultFor] = useState<string | null>(null);

  useEffect(() => {
    ensured.current = null;
    setEnsureError(null);
  }, [clubId]);

  useEffect(() => {
    if (!clubId || !ladderData || ladderData.data.length > 0) return;
    if (ensured.current === clubId) return;
    ensured.current = clubId;
    setEnsureError(null);
    api("/ladders/ensure", { method: "POST", body: JSON.stringify({ clubId }) })
      .then(() => reloadLadders())
      .catch(() => {
        setEnsureError("Merdiven açılamadı");
      });
  }, [clubId, ladderData, reloadLadders, ensureTick]);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancel = false;
    api<{ data: PlayerCard[] }>(`/players/search?q=${encodeURIComponent(query)}&pageSize=20`)
      .then((result) => {
        if (!cancel) setFound(result.data);
      })
      .catch(() => {
        if (!cancel) setFound([]);
      });
    return () => {
      cancel = true;
    };
  }, [pickerOpen, query]);

  if (!ready || (clubId && ladderLoading)) return <LoadingBlock label="Merdiven yükleniyor" />;
  if (!clubId) return <EmptyState title="Kulüp yok" body="Üstteki listeden bir kulüp seç." />;
  if (ladderError || !ladderData) return <ErrorState message={ladderError ?? "Merdiven açılmadı"} onRetry={reloadLadders} />;
  if (ensureError && ladderData.data.length === 0) {
    return (
      <ErrorState
        message={ensureError}
        onRetry={() => {
          ensured.current = null;
          setEnsureError(null);
          setEnsureTick((value) => value + 1);
        }}
      />
    );
  }

  const rows = ladderData.data;
  const target = rows.find((ladder) => ladder.id === (targetId ?? rows[0]?.id)) ?? null;
  const onTarget = new Set(target?.players.map((player) => player.userId) ?? []);
  const chosen = [...selected].filter((id) => !onTarget.has(id));
  const summary = target?.summary ?? { playerCount: 0, activeChallenges: 0, pendingOffers: 0, passivePlayers: 0 };

  function togglePlayer(id: string) {
    if (onTarget.has(id)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSelected(event: React.FormEvent) {
    event.preventDefault();
    if (!target || chosen.length === 0 || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      for (const userId of chosen) {
        await api(`/ladders/${target.id}/players`, { method: "POST", body: JSON.stringify({ userId }) });
      }
      setSelected(new Set());
      setMessage(chosen.length === 1 ? "Oyuncu eklendi." : "Oyuncular eklendi.");
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Oyuncu eklenemedi");
      await reloadLadders();
    } finally {
      setSaving(false);
    }
  }

  async function run(key: string, task: () => Promise<void>, ok: string) {
    setBusyId(key);
    setMessage(null);
    try {
      await task();
      setMessage(ok);
      setResultFor(null);
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "İşlem tamamlanamadı");
    } finally {
      setBusyId(null);
    }
  }

  const cards = [
    { label: "Toplam Oyuncu", value: summary.playerCount, caption: "Merdiven", accent: "border-t-[#2563eb]" },
    { label: "Aktif Defi", value: summary.activeChallenges, caption: "Devam eden", accent: "border-t-[#15803d]" },
    { label: "Bekleyen Teklif", value: summary.pendingOffers, caption: "Cevap bekleniyor", accent: "border-t-[#c45c2e]" },
    { label: "Pasif Oyuncu", value: summary.passivePlayers, caption: "30 gün hareketsiz", accent: "border-t-[#6b7280]" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Defi (Merdiven)</h1>
          <p className="mt-1 text-sm text-muted">3 basamak yukarıya kadar defi edebilirsin. Aynı anda tek aktif defi.</p>
        </div>
        {rows.length > 0 ? (
          <button type="button" aria-expanded={pickerOpen} className={actionClass} onClick={() => setPickerOpen((open) => !open)}>
            {pickerOpen ? "Kapat" : "Ekle"}
          </button>
        ) : null}
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
      {rows.length === 0 ? <LoadingBlock label="Merdiven hazırlanıyor" /> : null}
      {rows.length > 1 ? (
        <label className="block max-w-xs text-sm">
          Merdiven
          <select
            aria-label="Merdiven"
            value={target?.id ?? ""}
            onChange={(event) => setTargetId(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-line bg-surface px-2 text-sm"
          >
            {rows.map((ladder) => (
              <option key={ladder.id} value={ladder.id}>{ladder.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      {pickerOpen && target ? (
        <form className="space-y-3 rounded-3xl border border-line bg-surface p-4" onSubmit={(event) => void addSelected(event)}>
          <Input aria-label="Oyuncu ara" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Oyuncu ara" className="h-9" />
          <ul className="space-y-2" aria-label="Oyuncu seç">
            {found === null ? <li className="text-sm text-muted">Liste yükleniyor</li> : null}
            {found?.length === 0 ? <li className="text-sm text-muted">Eşleşen oyuncu yok</li> : null}
            {(found ?? []).map((player) => {
              const already = onTarget.has(player.id);
              const on = selected.has(player.id) && !already;
              return (
                <li key={player.id}>
                  <label className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-sm ${already ? "border-line opacity-70" : on ? "border-court bg-paper" : "border-line"} ${already ? "" : "cursor-pointer"}`}>
                    <input type="checkbox" className="h-4 w-4 shrink-0" checked={on} disabled={already} onChange={() => togglePlayer(player.id)} />
                    <Avatar first={player.firstName} last={player.lastName} photo={player.photoUrl} className="h-10 w-10 shrink-0 text-xs" />
                    <span className="min-w-0 flex-1 truncate font-medium">{player.firstName} {player.lastName}</span>
                    {already ? <span className="shrink-0 text-xs text-muted">Merdivende</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
          <button type="submit" disabled={chosen.length === 0 || saving} className={`${actionClass} disabled:opacity-50`}>
            Ekle
          </button>
        </form>
      ) : null}
      {target ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((card) => (
              <article key={card.label} className={`rounded-2xl border border-line border-t-4 bg-surface px-4 py-3 ${card.accent}`}>
                <p className="text-xs text-muted">{card.label}</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{card.value}</p>
                <p className="text-xs text-muted">{card.caption}</p>
              </article>
            ))}
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              {target.players.length === 0 ? <EmptyState title="Oyuncu yok" body="Ekle ile oyuncu seç." /> : null}
              {target.players.length > 0 ? (
                <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-line">
                      <th className="px-3 py-3 font-medium">Sıra</th>
                      <th className="px-3 py-3 font-medium">Değişim</th>
                      <th className="px-3 py-3 font-medium">Oyuncu</th>
                      <th className="px-3 py-3 font-medium">Durum</th>
                      <th className="px-3 py-3 font-medium">Defi hakkı</th>
                      <th className="px-3 py-3 font-medium">Aktif teklif / son teklif durumu</th>
                      <th className="px-3 py-3 font-medium">Son cevap</th>
                      <th className="px-3 py-3 font-medium">Maç tarihi</th>
                      <th className="px-3 py-3 font-medium">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {target.players.map((player) => {
                      const mine = player.userId === user?.id;
                      const offer = player.offer;
                      const involved = Boolean(user && offer && (offer.fromUserId === user.id || offer.toUserId === user.id));
                      const bounds = offer?.acceptedAt ? dateBounds(offer.acceptedAt) : null;
                      return (
                        <tr key={player.userId} className={`border-b border-line last:border-b-0 ${mine ? "bg-[#fef9c3]" : ""}`}>
                          <td className="px-3 py-3 tabular-nums">{player.rank}</td>
                          <td className="px-3 py-3">
                            {player.lastMove === "UP" ? (
                              <span className="inline-flex items-center gap-0.5 font-semibold text-[#15803d]">
                                <ArrowUp className="h-4 w-4" aria-hidden />
                                {player.lastMoveSteps != null ? <span className="text-xs">{player.lastMoveSteps}</span> : null}
                                <span className="sr-only">Yükseldi</span>
                              </span>
                            ) : null}
                            {player.lastMove === "DOWN" ? (
                              <span className="inline-flex items-center gap-0.5 font-semibold text-[#b91c1c]">
                                <ArrowDown className="h-4 w-4" aria-hidden />
                                {player.lastMoveSteps != null ? <span className="text-xs">{player.lastMoveSteps}</span> : null}
                                <span className="sr-only">Düştü</span>
                              </span>
                            ) : null}
                            {player.lastMove == null ? <span className="text-muted">—</span> : null}
                          </td>
                          <td className="px-3 py-3">
                            <span className="flex items-center gap-2">
                              <Avatar first={player.firstName} last={player.lastName} photo={player.photoUrl} className="h-8 w-8 shrink-0 text-[10px]" />
                              <span className="font-medium">{player.name}{mine ? " (Siz)" : ""}</span>
                            </span>
                          </td>
                          <td className={`px-3 py-3 ${player.passive ? "text-muted" : "text-[#15803d]"}`}>{player.passive ? "Pasif" : "Aktif"}</td>
                          <td className="px-3 py-3 tabular-nums">{player.challengeRight}/3</td>
                          <td className="px-3 py-3">{offer ? statusText(offer) : "—"}</td>
                          <td className="px-3 py-3">{answerText(offer)}</td>
                          <td className="px-3 py-3">{matchDateText(offer)}</td>
                          <td className="px-3 py-3">
                            <span className="flex flex-wrap items-center gap-1">
                              {offer && offer.toUserId === user?.id && offer.phase === "pending" ? (
                                <>
                                  <button type="button" disabled={busyId === offer.id} className={`${actionClass} border-court bg-court text-white`} onClick={() => void run(offer.id, () => api(`/match-offers/${offer.id}/accept`, { method: "POST" }), "Teklif kabul edildi.")}>Kabul Et</button>
                                  <button type="button" disabled={busyId === offer.id} className={actionClass} onClick={() => void run(offer.id, () => api(`/match-offers/${offer.id}/decline`, { method: "POST" }), "Teklif reddedildi.")}>Reddet</button>
                                </>
                              ) : null}
                              {involved && offer && offer.phase === "accepted" && bounds ? (
                                <form
                                  className="flex items-center gap-1"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    const date = new FormData(event.currentTarget).get("date");
                                    if (typeof date !== "string" || !date) return;
                                    void run(offer.id, () => api(`/match-offers/${offer.id}/schedule`, { method: "POST", body: JSON.stringify({ date }) }), "Maç tarihi belirlendi.");
                                  }}
                                >
                                  <input type="date" name="date" aria-label="Maç tarihi" required min={bounds.min} max={bounds.max} className="h-7 rounded-md border border-line bg-surface px-1 text-xs" />
                                  <button type="submit" disabled={busyId === offer.id} className={actionClass}>Tarih Belirle</button>
                                </form>
                              ) : null}
                              {involved && offer && offer.phase === "scheduled" && resultFor !== offer.id ? (
                                <button type="button" className={actionClass} onClick={() => setResultFor(offer.id)}>Sonuç Gir</button>
                              ) : null}
                              {involved && offer && offer.phase === "scheduled" && resultFor === offer.id ? (
                                <>
                                  <button type="button" aria-label={`${offer.fromName} kazandı`} disabled={busyId === offer.id} className={actionClass} onClick={() => void run(offer.id, () => api(`/match-offers/${offer.id}/result`, { method: "POST", body: JSON.stringify({ winnerId: offer.fromUserId }) }), "Sonuç kaydedildi.")}>{offer.fromName.split(" ")[0]}</button>
                                  <button type="button" aria-label={`${offer.toName} kazandı`} disabled={busyId === offer.id} className={actionClass} onClick={() => void run(offer.id, () => api(`/match-offers/${offer.id}/result`, { method: "POST", body: JSON.stringify({ winnerId: offer.toUserId }) }), "Sonuç kaydedildi.")}>{offer.toName.split(" ")[0]}</button>
                                </>
                              ) : null}
                              {player.canChallenge ? (
                                <button type="button" disabled={busyId === player.userId} className={actionClass} onClick={() => void run(player.userId, () => api("/match-offers", { method: "POST", body: JSON.stringify({ toUserId: player.userId, clubId, ladderId: target.id }) }), "Defi gönderildi.")}>Defi Et</button>
                              ) : null}
                              {!player.canChallenge && !(offer && offer.toUserId === user?.id && offer.phase === "pending") && !(involved && offer && (offer.phase === "accepted" || offer.phase === "scheduled")) ? <span className="text-muted">—</span> : null}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
            </div>
            <aside className="space-y-3">
              <section className="rounded-2xl border border-line bg-surface p-4">
                <h2 className="font-semibold">Açıklamalar</h2>
                <ul className="mt-2 space-y-1.5 text-sm text-muted">
                  <li>Yeşil ok: oyuncu yükseldi</li>
                  <li>Kırmızı ok: oyuncu düştü</li>
                  <li>— : sıra değişmedi</li>
                  <li>Aktif: son 30 günde hareketi olan oyuncu</li>
                  <li>Pasif: 30 gündür hareketi olmayan oyuncu</li>
                </ul>
              </section>
              <section className="rounded-2xl border border-line bg-surface p-4">
                <h2 className="font-semibold">Kısa Kurallar</h2>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-muted">
                  <li>En fazla 3 basamak yukarı defi</li>
                  <li>Aynı anda 1 aktif defi</li>
                  <li>Rakip 48 saat içinde cevaplar</li>
                  <li>Kabulden sonra 72 saat içinde tarih</li>
                  <li>Maç kabulden itibaren 7 gün içinde oynanır</li>
                  <li>Aynı rakibe 7 gün tekrar defi yok</li>
                </ul>
              </section>
              <section className="rounded-2xl border border-line bg-surface p-4">
                <h2 className="font-semibold">Üç işaret</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  <li className="flex items-center gap-2 text-[#15803d]"><ArrowUp className="h-4 w-4" aria-hidden /> Yükseldi</li>
                  <li className="flex items-center gap-2 text-[#b91c1c]"><ArrowDown className="h-4 w-4" aria-hidden /> Düştü</li>
                  <li className="flex items-center gap-2 text-muted"><span className="inline-block w-4 text-center">—</span> Değişmedi</li>
                </ul>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
