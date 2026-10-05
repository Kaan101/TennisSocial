"use client";

import type { PlayerCard } from "@club/types";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/player-card";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useClub } from "@/lib/club";
import { useResource } from "@/lib/use-resource";

type LadderPlayer = {
  userId: string;
  name: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  rank: number;
  lastMove: "UP" | "DOWN" | null;
};
type LadderOffer = {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  daysLeft: number;
};
type Ladder = {
  id: string;
  name: string;
  clubId: string | null;
  playerCount: number;
  players: LadderPlayer[];
  offers: LadderOffer[];
};

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
  const [closedIds, setClosedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [offeringId, setOfferingId] = useState<string | null>(null);

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

  function togglePlayer(id: string) {
    if (onTarget.has(id)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleLadder(id: string) {
    setClosedIds((current) => {
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
      setClosedIds((current) => {
        const next = new Set(current);
        next.delete(target.id);
        return next;
      });
      setMessage(chosen.length === 1 ? "Oyuncu eklendi." : "Oyuncular eklendi.");
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Oyuncu eklenemedi");
      await reloadLadders();
    } finally {
      setSaving(false);
    }
  }

  async function offerMatch(ladderId: string, player: LadderPlayer) {
    if (!clubId || player.userId === user?.id) return;
    setOfferingId(player.userId);
    setMessage(null);
    try {
      await api("/match-offers", { method: "POST", body: JSON.stringify({ toUserId: player.userId, clubId, ladderId }) });
      setMessage(`${player.name} teklif yaptı.`);
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Teklif kaydedilemedi");
    } finally {
      setOfferingId(null);
    }
  }

  async function recordWinner(offerId: string, winnerId: string) {
    setMessage(null);
    try {
      await api(`/match-offers/${offerId}/result`, { method: "POST", body: JSON.stringify({ winnerId }) });
      setMessage("Sonuç kaydedildi.");
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sonuç kaydedilemedi");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Merdiven"
        action={
          rows.length > 0 ? (
            <button
              type="button"
              aria-expanded={pickerOpen}
              className="court-press rounded-md border border-line px-2 py-1 text-xs"
              onClick={() => setPickerOpen((open) => !open)}
            >
              {pickerOpen ? "Kapat" : "Ekle"}
            </button>
          ) : null
        }
      />
      {message ? <p className="text-sm">{message}</p> : null}
      {rows.length === 0 ? <LoadingBlock label="Merdiven hazırlanıyor" /> : null}
      {pickerOpen && target ? (
        <form className="space-y-3 rounded-3xl border border-line bg-surface p-4" onSubmit={(event) => void addSelected(event)}>
          {rows.length > 1 ? (
            <label className="block text-sm">
              Merdiven
              <select
                aria-label="Merdiven"
                value={target.id}
                onChange={(event) => setTargetId(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-line bg-surface px-2 text-sm"
              >
                {rows.map((ladder) => (
                  <option key={ladder.id} value={ladder.id}>{ladder.name}</option>
                ))}
              </select>
            </label>
          ) : null}
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
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={on}
                      disabled={already}
                      onChange={() => togglePlayer(player.id)}
                    />
                    <Avatar first={player.firstName} last={player.lastName} photo={player.photoUrl} className="h-10 w-10 shrink-0 text-xs" />
                    <span className="min-w-0 flex-1 truncate font-medium">{player.firstName} {player.lastName}</span>
                    {already ? <span className="shrink-0 text-xs text-muted">Merdivende</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="submit"
            disabled={chosen.length === 0 || saving}
            className="court-press rounded-md border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Ekle
          </button>
        </form>
      ) : null}
      {rows.map((ladder) => {
        const open = !closedIds.has(ladder.id);
        return (
          <section key={ladder.id} className="overflow-hidden rounded-3xl border border-line bg-surface">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggleLadder(ladder.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold"
            >
              <span>{ladder.name}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {open ? (
              <div className="space-y-2 px-3 pb-3">
                {ladder.players.length === 0 ? <EmptyState title="Oyuncu yok" body="Ekle ile oyuncu seç." /> : null}
                <ol className="space-y-2">
                  {ladder.players.map((player, index) => {
                    const mineIndex = ladder.players.findIndex((item) => item.userId === user?.id);
                    const neighbor = mineIndex >= 0 && Math.abs(index - mineIndex) === 1;
                    const betweenUs = (ladder.offers ?? []).find((offer) =>
                      Boolean(user) && (
                        (offer.fromUserId === user?.id && offer.toUserId === player.userId)
                        || (offer.toUserId === user?.id && offer.fromUserId === player.userId)
                      ),
                    );
                    const incoming = (ladder.offers ?? []).find((offer) => offer.toUserId === player.userId);
                    const shown = player.userId === user?.id ? incoming : (betweenUs ?? incoming);
                    return (
                      <li key={player.userId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line px-3 py-2 text-sm">
                        <Avatar first={player.firstName} last={player.lastName} photo={player.photoUrl} className="h-10 w-10 shrink-0 text-xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{player.rank}. {player.name}</span>
                          {shown ? (
                            <span className="block truncate text-xs text-muted">{shown.fromName} teklif yaptı · {shown.daysLeft} gün</span>
                          ) : null}
                        </span>
                        {player.lastMove === "UP" ? (
                          <ArrowUp className="h-4 w-4 shrink-0 text-[#15803d]" aria-label="Yükseldi" />
                        ) : null}
                        {player.lastMove === "DOWN" ? (
                          <ArrowDown className="h-4 w-4 shrink-0 text-[#b91c1c]" aria-label="Düştü" />
                        ) : null}
                        {betweenUs && player.userId !== user?.id ? (
                          <span className="flex shrink-0 items-center gap-1">
                            <span className="text-xs text-muted">Sonuç</span>
                            <button type="button" aria-label={`${betweenUs.fromName} kazandı`} onClick={() => void recordWinner(betweenUs.id, betweenUs.fromUserId)} className="court-press rounded-md border border-line px-2 py-1 text-xs">{betweenUs.fromName.split(" ")[0]}</button>
                            <button type="button" aria-label={`${betweenUs.toName} kazandı`} onClick={() => void recordWinner(betweenUs.id, betweenUs.toUserId)} className="court-press rounded-md border border-line px-2 py-1 text-xs">{betweenUs.toName.split(" ")[0]}</button>
                          </span>
                        ) : null}
                        {neighbor && !betweenUs ? (
                          <button
                            type="button"
                            disabled={offeringId === player.userId}
                            onClick={() => void offerMatch(ladder.id, player)}
                            className="court-press shrink-0 rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-60"
                          >
                            Teklif yap
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
