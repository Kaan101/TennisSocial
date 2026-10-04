"use client";

import type { PlayerCard } from "@club/types";
import { useEffect, useRef, useState } from "react";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useClub } from "@/lib/club";
import { useResource } from "@/lib/use-resource";

type LadderPlayer = { userId: string; name: string; rank: number; points: number };
type Ladder = {
  id: string;
  name: string;
  clubId: string | null;
  playerCount: number;
  players: LadderPlayer[];
};
type Offer = {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  clubId: string;
  status: "PENDING";
};

export default function LadderPage() {
  const { user } = useAuth();
  const { clubId, ready } = useClub();
  const { data: ladderData, error: ladderError, loading: ladderLoading, reload: reloadLadders } = useResource<{ data: Ladder[] }>(clubId ? `/ladders?clubId=${encodeURIComponent(clubId)}` : null);
  const { data: offerData, error: offerError, loading: offerLoading, reload: reloadOffers } = useResource<{ data: Offer[] }>(clubId ? `/match-offers?clubId=${encodeURIComponent(clubId)}` : null);
  const ensured = useRef<string | null>(null);
  const [ensureTick, setEnsureTick] = useState(0);
  const [ensureError, setEnsureError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PlayerCard[] | null>(null);
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
    api<{ data: PlayerCard[] }>(`/players/search?q=${encodeURIComponent(query)}&pageSize=12`)
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

  if (!ready || (clubId && (ladderLoading || offerLoading))) return <LoadingBlock label="Merdiven yükleniyor" />;
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
  const pendingTo = new Set(
    (offerData?.data ?? []).filter((offer) => offer.fromUserId === user?.id).map((offer) => offer.toUserId),
  );

  async function addPlayer(player: PlayerCard) {
    if (!target || onTarget.has(player.id)) return;
    setMessage(null);
    try {
      await api(`/ladders/${target.id}/players`, { method: "POST", body: JSON.stringify({ userId: player.id }) });
      setMessage(`${player.firstName} ${player.lastName} eklendi.`);
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Oyuncu eklenemedi");
    }
  }

  async function offerMatch(player: LadderPlayer) {
    if (!clubId || player.userId === user?.id) return;
    setOfferingId(player.userId);
    setMessage(null);
    try {
      await api("/match-offers", { method: "POST", body: JSON.stringify({ toUserId: player.userId, clubId }) });
      setMessage(`${player.name} için maç teklifi kaydedildi.`);
      await reloadOffers();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Maç teklifi kaydedilemedi");
    } finally {
      setOfferingId(null);
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
              className="court-press rounded-md border border-line px-2 py-1 text-xs"
              onClick={() => setPickerOpen((open) => !open)}
            >
              Ekle
            </button>
          ) : null
        }
      />
      {rows.length === 1 && rows[0].name !== "Merdiven" ? <p className="text-sm font-semibold">{rows[0].name}</p> : null}
      {message ? <p className="text-sm">{message}</p> : null}
      {rows.length === 0 ? <LoadingBlock label="Merdiven hazırlanıyor" /> : null}
      {pickerOpen && target ? (
        <form
          className="space-y-2 rounded-3xl border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
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
          <ul className="space-y-2">
            {(found ?? []).map((player) => {
              const already = onTarget.has(player.id);
              return (
                <li key={player.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{player.firstName} {player.lastName}</span>
                  {already ? (
                    <span className="text-xs text-muted">Merdivende</span>
                  ) : (
                    <button type="button" onClick={() => void addPlayer(player)} className="court-press shrink-0 rounded-md border border-line px-2 py-1 text-xs">
                      Ekle
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </form>
      ) : null}
      {rows.map((ladder) => (
        <section key={ladder.id} className="space-y-2">
          {rows.length > 1 ? <h2 className="font-semibold">{ladder.name}</h2> : null}
          {ladder.players.length === 0 ? <EmptyState title="Oyuncu yok" body="Ekle ile bir oyuncu seç." /> : null}
          <ol className="space-y-2">
            {ladder.players.map((player) => {
              const mine = player.userId === user?.id;
              const pending = pendingTo.has(player.userId);
              return (
                <li key={player.userId} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
                  <span>{player.rank}. {player.name}</span>
                  {mine ? null : (
                    <button
                      type="button"
                      disabled={pending || offeringId === player.userId}
                      onClick={() => void offerMatch(player)}
                      className="court-press shrink-0 rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-60"
                    >
                      {pending ? "Teklif bekliyor" : "Maç teklif et"}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      <section className="space-y-2">
        <h2 className="font-semibold">Maç teklifleri</h2>
        {offerError ? <ErrorState message={offerError} onRetry={reloadOffers} /> : null}
        {!offerError && (offerData?.data.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">Bekleyen teklif yok.</p>
        ) : null}
        {(offerData?.data ?? []).map((offer) => {
          const incoming = offer.toUserId === user?.id;
          const text = incoming
            ? `${offer.fromName || "Bir oyuncu"} sana maç teklif etti`
            : `${offer.toName} için teklifin duruyor`;
          return (
            <p key={offer.id} className="rounded-2xl border border-line px-4 py-3 text-sm">
              {text} · bekliyor
            </p>
          );
        })}
      </section>
    </div>
  );
}
