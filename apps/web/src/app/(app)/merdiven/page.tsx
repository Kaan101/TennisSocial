"use client";

import type { AuthUser, PlayerCard } from "@club/types";
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
  passive?: boolean;
  passiveUntil?: string | null;
};
type LadderOffer = {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  status: string;
  createdAt?: string;
  acceptedAt: string | null;
  scheduledAt: string | null;
  scheduleDeadlineAt?: string | null;
  proposedWinnerId?: string | null;
  resultEnteredAt?: string | null;
  disputedAt?: string | null;
  postponeCount?: number;
  forfeit?: boolean;
  acceptDays: number;
  acceptRemaining?: { days: number; hours: number };
};
type LadderSettings = {
  showOfferingPlayer: boolean;
  showChallengeResult: boolean;
  acceptDays: number;
  responseHours: number;
  maxRankSpan: number;
};

type Ladder = {
  id: string;
  name: string;
  clubId: string | null;
  playerCount: number;
  players: LadderPlayer[];
  offers: LadderOffer[];
} & LadderSettings;

function resolveViewerSeat(players: LadderPlayer[], user: AuthUser | null | undefined): LadderPlayer | undefined {
  if (!user) return undefined;
  const byId = players.find((player) => player.userId === user.id);
  if (byId) return byId;
  const first = user.firstName.trim().toLocaleLowerCase("tr-TR");
  const last = user.lastName.trim().toLocaleLowerCase("tr-TR");
  if (!first || !last) return undefined;
  return players.find(
    (player) =>
      player.firstName.trim().toLocaleLowerCase("tr-TR") === first
      && player.lastName.trim().toLocaleLowerCase("tr-TR") === last,
  );
}

function ladderViewerId(players: LadderPlayer[], user: AuthUser | null | undefined): string | null {
  return resolveViewerSeat(players, user)?.userId ?? user?.id ?? null;
}

function playerIsViewer(playerUserId: string, viewerId: string | null): boolean {
  return viewerId !== null && playerUserId === viewerId;
}

function withinRankSpan(myRank: number, theirRank: number, maxRankSpan: number): boolean {
  const gap = myRank - theirRank;
  return gap >= 1 && gap <= maxRankSpan;
}

const ACTIVE_CHALLENGE_STATUSES = new Set(["PENDING", "ACCEPTED", "SCHEDULED"]);

function offerOpenForUi(offer: LadderOffer, responseHours: number): boolean {
  return offerStillActiveOnClient(offer, responseHours) && !offer.proposedWinnerId;
}

/** Matches ladder API offerStillActive for whether this player is still in an open defi. */
function offerOccupiesPlayer(offer: LadderOffer, userId: string, responseHours: number): boolean {
  if (offer.fromUserId !== userId && offer.toUserId !== userId) return false;
  return offerStillActiveOnClient(offer, responseHours);
}

function findPairOffer(
  offers: LadderOffer[] | undefined,
  viewerId: string,
  otherUserId: string,
  responseHours: number,
): LadderOffer | undefined {
  return (offers ?? []).find(
    (offer) =>
      offerOccupiesPlayer(offer, viewerId, responseHours)
      && (
        (offer.fromUserId === viewerId && offer.toUserId === otherUserId)
        || (offer.fromUserId === otherUserId && offer.toUserId === viewerId)
      ),
  );
}

function recipientHasOpenDefi(offers: LadderOffer[] | undefined, recipientUserId: string, responseHours: number): boolean {
  return (offers ?? []).some(
    (offer) => offer.toUserId === recipientUserId && offerOccupiesPlayer(offer, recipientUserId, responseHours),
  );
}

function findIncomingChallenge(
  offers: LadderOffer[] | undefined,
  playerUserId: string,
  responseHours: number,
): LadderOffer | undefined {
  return (offers ?? []).find((offer) => offerOpenForUi(offer, responseHours) && offer.toUserId === playerUserId);
}

function findOutgoingChallenge(
  offers: LadderOffer[] | undefined,
  playerUserId: string,
  responseHours: number,
): LadderOffer | undefined {
  return (offers ?? []).find((offer) => offerOpenForUi(offer, responseHours) && offer.fromUserId === playerUserId);
}

function challengeRowClass(offer: LadderOffer | undefined): string {
  const base = "flex flex-wrap items-center gap-3 rounded-2xl border px-3 py-2 text-sm";
  if (!offer) return `${base} border-line`;
  if (offer.scheduledAt) {
    return `${base} border-[#15803d] bg-[#15803d]/10 ring-2 ring-[#15803d]/35`;
  }
  return `${base} border-court bg-paper/70 ring-2 ring-court/40`;
}

function ladderPlayerRowClass(input: { isViewerRow: boolean; incomingChallenge: LadderOffer | undefined }): string {
  if (input.isViewerRow) {
    return "flex flex-wrap items-center gap-3 rounded-2xl border border-court bg-paper px-3 py-2 text-sm";
  }
  if (input.incomingChallenge) return challengeRowClass(input.incomingChallenge);
  return "flex flex-wrap items-center gap-3 rounded-2xl border border-line px-3 py-2 text-sm";
}

function datetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const RESULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MATCH_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
const SCHEDULE_DEADLINE_MS = 72 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function offerStillActiveOnClient(offer: LadderOffer, responseHours: number): boolean {
  if (offer.proposedWinnerId && offer.resultEnteredAt && !offer.disputedAt) {
    return new Date(offer.resultEnteredAt).getTime() + RESULT_WINDOW_MS > Date.now();
  }
  if (!ACTIVE_CHALLENGE_STATUSES.has(offer.status)) return false;
  const createdAt = offer.createdAt ? new Date(offer.createdAt).getTime() : null;
  if (createdAt !== null && createdAt + MATCH_WINDOW_MS <= Date.now()) return false;
  if (offer.status === "PENDING" && createdAt !== null) {
    return createdAt + responseHours * HOUR_MS > Date.now();
  }
  if (offer.status === "ACCEPTED" && offer.acceptedAt) {
    const acceptedMs = new Date(offer.acceptedAt).getTime();
    if (!offer.scheduledAt) {
      const scheduleBy =
        offer.scheduleDeadlineAt != null
          ? new Date(offer.scheduleDeadlineAt).getTime()
          : acceptedMs + SCHEDULE_DEADLINE_MS;
      if (scheduleBy <= Date.now()) return false;
    }
    return acceptedMs + offer.acceptDays * DAY_MS > Date.now();
  }
  if (offer.status === "SCHEDULED" && createdAt !== null) {
    return createdAt + MATCH_WINDOW_MS > Date.now();
  }
  return false;
}

const LADDER_RULES = [
  "Oyuncu en fazla 3 sıra üstündeki oyuncuya defi yapabilir.",
  "Aynı anda yalnızca 1 aktif defi olabilir.",
  "Defi alan oyuncu teklife 48 saat içinde cevap vermelidir.",
  "Defi kabul edilirse maç 7 gün içinde oynanmalıdır.",
  "Taraflar maç tarihini 72 saat içinde belirlemelidir.",
  "Alt sıradaki oyuncu kazanırsa rakibinin sırasına çıkar.",
  "Aradaki oyuncular bir sıra aşağı kayar.",
  "Üst sıradaki oyuncu kazanırsa sıralama değişmez.",
  "Maç sonucu, maçtan sonra 24 saat içinde sisteme girilmelidir.",
  "Rakip sonucu 24 saat içinde onaylamalı veya itiraz etmelidir.",
  "24 saat içinde itiraz edilmezse sonuç otomatik onaylanır.",
  "Defiye 48 saat cevap verilmezse, defi reddedilmiş sayılır.",
  "Defi kabul edildiği halde oyuncu maça mazeretsiz gelmezse hükmen mağlup sayılır.",
  "Aynı rakibe tekrar defi göndermek için 7 gün beklenir.",
  "Oyuncu seyahat veya sakatlık nedeniyle en fazla 30 gün pasif olabilir.",
  "Pasif oyuncuya defi gönderilemez.",
  "30 günden uzun pasiflikte sıralama yönetim tarafından yeniden değerlendirilir.",
  "Maç ertelenecekse taraflar en az 24 saat önce bildirim yapmalıdır.",
  "Bir defi maçı en fazla 1 kez ertelenebilir.",
  "Ertelenen maç yine ilk defi tarihinden itibaren en geç 10 gün içinde oynanmalıdır.",
  "Tüm defi sonuçları ve sıralama değişiklikleri sistemde saklanır.",
];

function LadderAciklama() {
  return (
    <article className="space-y-3 text-xs leading-snug text-muted">
      <h2 className="text-sm font-semibold text-ink">DEFİ SİSTEMİ</h2>
      <p>
        Defi Sistemi, oyuncuların sıralamada yükselmek amacıyla üst sıradaki oyunculara maç teklif ettiği rekabet sistemidir.
      </p>
      <p>Her oyuncu mevcut sıralamasında kendisinden en fazla 3 sıra yukarıdaki oyunculardan birine defi gönderebilir.</p>
      <p>Oyuncu kendisinden alt sıradaki bir oyuncuya defi gönderemez. Ancak alt sıradaki oyunculardan defi alabilir.</p>
      <p>Defi alan oyuncu, teklif tarihinden itibaren belirlenen süre içinde maçı kabul etmeli veya uygun olduğu tarihleri bildirmelidir.</p>
      <p>Kabul edilen defi maçı, mümkünse belirlenen süre içerisinde oynanmalıdır.</p>
      <p>Bir oyuncunun aynı anda yalnızca bir aktif defi maçı bulunabilir. Aktif defi tamamlanmadan yeni defi gönderilemez.</p>
      <p>
        Defi maçının formatı kulüp tarafından belirlenir. Örneğin maçlar 8 oyunluk Pro Set, normal set veya başka bir kısa maç formatında oynanabilir.
      </p>
      <p>Alt sıradaki oyuncu maçı kazanırsa, mağlup ettiği oyuncunun bulunduğu sıraya yükselir. Aradaki oyuncular birer sıra aşağı kaydırılır.</p>
      <div className="rounded-2xl border border-line bg-paper/60 p-3 text-ink">
        <p className="font-semibold">Örnek</p>
        <p className="mt-2">Maç öncesi sıralama:</p>
        <p className="mt-1 whitespace-pre-line font-medium">
          {`3. Ahmet\n4. Mehmet\n5. Kaan\n6. Murat`}
        </p>
        <p className="mt-2">5. sıradaki Kaan, 3. sıradaki Ahmet&apos;e defi gönderir.</p>
        <p className="mt-2">Kaan kazanırsa yeni sıralama:</p>
        <p className="mt-1 whitespace-pre-line font-medium">
          {`3. Kaan\n4. Ahmet\n5. Mehmet\n6. Murat`}
        </p>
      </div>
      <p>Bu sistemde oyuncular doğrudan yer değiştirmez; sıralama kaydırmalı olarak güncellenir.</p>
      <p>Üst sıradaki oyuncu maçı kazanırsa sıralamada herhangi bir değişiklik yapılmaz.</p>
      <p>Defi maçının sonucu, maç tamamlandıktan sonra oyunculardan biri tarafından sisteme girilir ve diğer oyuncu tarafından onaylanır.</p>
      <p>Sonuç onaylandığında sistem sıralamayı otomatik olarak günceller.</p>
      <p>
        Oyuncunun sakatlık, seyahat, tatil veya başka bir nedenle maç yapamayacağı dönemlerde durumu Pasif / Müsait Değil olarak işaretlenebilir.
      </p>
      <p>
        Pasif durumdaki oyuncuya defi gönderilemez. Oyuncu tekrar aktif olduğunda mevcut sırasından veya kulüp yönetiminin belirlediği kurala göre sisteme devam eder.
      </p>
      <p>
        Defi alan oyuncunun makul bir gerekçe olmaksızın sürekli olarak maçı reddetmesi veya belirlenen süre içinde cevap vermemesi halinde defi gönderen oyuncu lehine sıralama düzenlemesi yapılabilir.
      </p>
      <p>
        Aynı iki oyuncu arasında arka arkaya sürekli defi yapılmasını önlemek için rövanş süresi uygulanabilir. Örneğin aynı oyuncuya yeniden defi göndermek için 7 gün bekleme süresi konulabilir.
      </p>
      <p>Oyuncular yalnızca kendi defi aralıklarında bulunan oyuncular için “Defi Et” butonunu görür.</p>
      <p>Defi ekranında oyuncular aşağıdaki bilgileri görebilir:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Güncel sıralama</li>
        <li>Defi yapılabilecek oyuncular</li>
        <li>Aktif defi</li>
        <li>Bekleyen teklifler</li>
        <li>Planlanan maçlar</li>
        <li>Son oynanan defi maçları</li>
        <li>Kazanılan ve kaybedilen defi maçları</li>
        <li>Sıralama değişimleri</li>
      </ul>
      <p>Sistem tüm sıralama değişikliklerini geçmiş kayıtlarında saklar. Böylece oyuncunun zaman içerisindeki yükselme ve düşüşleri takip edilebilir.</p>
      <p>Kulüp yönetimi gerekli gördüğünde defi mesafesini, maç formatını, cevap süresini ve pasiflik kurallarını değiştirebilir.</p>
      <p>
        Defi sisteminin temel amacı yalnızca sıralama oluşturmak değil; oyuncular arasında düzenli maç yapılmasını, benzer seviyelerdeki oyuncuların karşılaşmasını ve kulüp içi rekabetin canlı tutulmasını sağlamaktır.
      </p>
    </article>
  );
}

function acceptRemainingFromStored(acceptedAt: string, acceptDays: number): { days: number; hours: number } {
  const left = new Date(acceptedAt).getTime() + acceptDays * DAY_MS - Date.now();
  const totalHours = Math.max(0, Math.floor(left / HOUR_MS));
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}

function AcceptCountdown({ acceptedAt, acceptDays }: { acceptedAt: string; acceptDays: number }) {
  const [remaining, setRemaining] = useState(() => acceptRemainingFromStored(acceptedAt, acceptDays));
  useEffect(() => {
    setRemaining(acceptRemainingFromStored(acceptedAt, acceptDays));
    const timer = window.setInterval(() => {
      setRemaining(acceptRemainingFromStored(acceptedAt, acceptDays));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [acceptedAt, acceptDays]);
  return (
    <span className="text-xs text-muted">
      {remaining.days} gün {remaining.hours} saat
    </span>
  );
}

function LadderAyarlar({
  ladder,
  canManage,
  onSaved,
}: {
  ladder: Ladder | null;
  canManage: boolean;
  onSaved: () => Promise<void>;
}) {
  const [showOfferingPlayer, setShowOfferingPlayer] = useState(true);
  const [showChallengeResult, setShowChallengeResult] = useState(true);
  const [acceptDays, setAcceptDays] = useState("7");
  const [responseHours, setResponseHours] = useState("48");
  const [maxRankSpan, setMaxRankSpan] = useState("3");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!ladder) return;
    setShowOfferingPlayer(ladder.showOfferingPlayer);
    setShowChallengeResult(ladder.showChallengeResult);
    setAcceptDays(String(ladder.acceptDays));
    setResponseHours(String(ladder.responseHours));
    setMaxRankSpan(String(ladder.maxRankSpan));
    setMessage(null);
  }, [ladder]);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!ladder || !canManage || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await api(`/ladders/${ladder.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          showOfferingPlayer,
          showChallengeResult,
          acceptDays: Number(acceptDays),
          responseHours: Number(responseHours),
          maxRankSpan: Number(maxRankSpan),
        }),
      });
      setMessage("Ayarlar kaydedildi.");
      await onSaved();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ayarlar kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  if (!ladder) {
    return <p className="text-sm text-muted">Merdiven seçilince ayarlar burada görünür.</p>;
  }

  return (
    <form className="space-y-4 text-sm" onSubmit={(event) => void saveSettings(event)}>
      <label className="flex items-center justify-between gap-3">
        <span>Teklif eden oyuncuyu göster</span>
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0"
          checked={showOfferingPlayer}
          disabled={!canManage}
          onChange={(event) => setShowOfferingPlayer(event.target.checked)}
        />
      </label>
      <label className="flex items-center justify-between gap-3">
        <span>Defi sonucunu göster</span>
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0"
          checked={showChallengeResult}
          disabled={!canManage}
          onChange={(event) => setShowChallengeResult(event.target.checked)}
        />
      </label>
      <label className="block">
        <span className="block">Defi Kabul gün sayısı</span>
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          value={acceptDays}
          disabled={!canManage}
          onChange={(event) => setAcceptDays(event.target.value)}
          className="mt-1 h-9"
        />
      </label>
      <label className="block">
        <span className="block">Defi yanıt süresi</span>
        <div className="mt-1 flex items-center gap-2">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={responseHours}
            disabled={!canManage}
            onChange={(event) => setResponseHours(event.target.value)}
            className="h-9 min-w-0 flex-1"
          />
          <span className="shrink-0 text-muted">saat</span>
        </div>
      </label>
      <label className="block">
        <span className="block">Teklif üst sıra sayısı</span>
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          value={maxRankSpan}
          disabled={!canManage}
          onChange={(event) => setMaxRankSpan(event.target.value)}
          className="mt-1 h-9"
        />
      </label>
      {canManage ? (
        <button
          type="submit"
          disabled={saving}
          className="court-press rounded-md border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Kaydet
        </button>
      ) : (
        <p className="text-xs text-muted">Ayarları yalnızca kulüp yöneticisi değiştirebilir.</p>
      )}
      {message ? <p className="text-xs">{message}</p> : null}
    </form>
  );
}

function LadderSide({
  ladder,
  canManage,
  onSaved,
}: {
  ladder: Ladder | null;
  canManage: boolean;
  onSaved: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"kurallar" | "aciklama" | "ayarlar">("kurallar");
  const tabs = [
    { id: "kurallar" as const, label: "Kurallar" },
    { id: "aciklama" as const, label: "Açıklama" },
    { id: "ayarlar" as const, label: "Ayarlar" },
  ];
  return (
    <aside className="flex min-w-0 max-h-[calc(100dvh-11.5rem)] flex-col overflow-hidden rounded-3xl border border-line bg-surface p-4 lg:col-span-2 lg:sticky lg:top-2">
      <div className="flex shrink-0 gap-4 border-b border-line" role="tablist" aria-label="Merdiven">
        {tabs.map((item) => {
          const on = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`merdiven-${item.id}`}
              aria-selected={on}
              aria-controls={`merdiven-${item.id}-panel`}
              onClick={() => setTab(item.id)}
              className={`-mb-px border-b-2 pb-2 text-sm ${on ? "border-court font-semibold text-court" : "border-transparent text-muted"}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`merdiven-${tab}-panel`}
        aria-labelledby={`merdiven-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto pt-3"
      >
        {tab === "kurallar" ? (
          <ol className="list-decimal space-y-2 pl-5 text-xs leading-snug">
            {LADDER_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        ) : null}
        {tab === "aciklama" ? <LadderAciklama /> : null}
        {tab === "ayarlar" ? <LadderAyarlar ladder={ladder} canManage={canManage} onSaved={onSaved} /> : null}
      </div>
    </aside>
  );
}

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
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [resultingId, setResultingId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [scheduleDraftOfferId, setScheduleDraftOfferId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

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

  const rows = ladderData.data.map((ladder) => ({
    ...ladder,
    showOfferingPlayer: ladder.showOfferingPlayer ?? true,
    showChallengeResult: ladder.showChallengeResult ?? true,
    acceptDays: ladder.acceptDays ?? 7,
    responseHours: ladder.responseHours ?? 48,
    maxRankSpan: Number(ladder.maxRankSpan) > 0 ? Number(ladder.maxRankSpan) : 3,
  }));
  const target = rows.find((ladder) => ladder.id === (targetId ?? rows[0]?.id)) ?? null;
  const canManageLadder = user?.role === "ADMIN" || user?.role === "CLUB_MANAGER";
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

  async function offerMatch(ladderId: string, player: LadderPlayer, viewerUserId: string | null) {
    if (!clubId || !viewerUserId || player.userId === viewerUserId) return;
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

  async function acceptOffer(offerId: string) {
    setAcceptingId(offerId);
    setMessage(null);
    try {
      await api(`/match-offers/${offerId}/accept`, { method: "POST", body: JSON.stringify({}) });
      setMessage("Teklif kabul edildi.");
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Teklif kabul edilemedi");
    } finally {
      setAcceptingId(null);
    }
  }

  async function proposeResult(offerId: string, winnerId: string) {
    setResultingId(offerId);
    setMessage(null);
    try {
      await api(`/match-offers/${offerId}/result`, { method: "POST", body: JSON.stringify({ winnerId }) });
      setMessage("Sonuç gönderildi, rakip onayını bekliyor.");
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sonuç kaydedilemedi");
    } finally {
      setResultingId(null);
    }
  }

  async function confirmResult(offerId: string) {
    setResultingId(offerId);
    setMessage(null);
    try {
      await api(`/match-offers/${offerId}/confirm`, { method: "POST", body: JSON.stringify({}) });
      setMessage("Sonuç onaylandı.");
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sonuç onaylanamadı");
    } finally {
      setResultingId(null);
    }
  }

  async function disputeResult(offerId: string) {
    setResultingId(offerId);
    setMessage(null);
    try {
      await api(`/match-offers/${offerId}/dispute`, { method: "POST", body: JSON.stringify({}) });
      setMessage("Sonuca itiraz edildi.");
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "İtiraz kaydedilemedi");
    } finally {
      setResultingId(null);
    }
  }

  async function scheduleMatch(offerId: string, scheduledAtLocal: string) {
    if (!scheduledAtLocal) return;
    setSchedulingId(offerId);
    setMessage(null);
    try {
      await api(`/match-offers/${offerId}/schedule`, {
        method: "POST",
        body: JSON.stringify({ scheduledAt: new Date(scheduledAtLocal).toISOString() }),
      });
      setMessage("Maç tarihi kaydedildi.");
      setScheduleDraft("");
      setScheduleDraftOfferId(null);
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Maç tarihi kaydedilemedi");
    } finally {
      setSchedulingId(null);
    }
  }

  async function cancelOffer(offerId: string) {
    setCancellingId(offerId);
    setMessage(null);
    try {
      await api(`/match-offers/${offerId}/cancel`, { method: "POST", body: JSON.stringify({}) });
      setMessage("Defi iptal edildi.");
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Defi iptal edilemedi");
    } finally {
      setCancellingId(null);
    }
  }

  async function recordForfeit(offerId: string) {
    setResultingId(offerId);
    setMessage(null);
    try {
      await api(`/match-offers/${offerId}/forfeit`, { method: "POST", body: JSON.stringify({}) });
      setMessage("Hükmen sonuç kaydedildi.");
      await reloadLadders();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Hükmen sonuç kaydedilemedi");
    } finally {
      setResultingId(null);
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-5">
      <div className="min-w-0 space-y-4 lg:col-span-3">
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
      {user ? (
        <p className="text-sm font-semibold text-ink">
          {user.firstName} {user.lastName}
        </p>
      ) : null}
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
        const mySeat = resolveViewerSeat(ladder.players, user);
        const viewerId = ladderViewerId(ladder.players, user);
        const myRank = mySeat?.rank;
        const maxRankSpan = ladder.maxRankSpan;
        const responseHours = ladder.responseHours;
        const viewerDefiOpen =
          viewerId !== null
          && (ladder.offers ?? []).some((offer) => offerOccupiesPlayer(offer, viewerId, responseHours));
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
                  {ladder.players.map((player) => {
                    const withinSpan =
                      myRank !== undefined
                      && withinRankSpan(myRank, player.rank, maxRankSpan);
                    const incomingChallenge = findIncomingChallenge(ladder.offers, player.userId, responseHours);
                    const outgoingChallenge = findOutgoingChallenge(ladder.offers, player.userId, responseHours);
                    const pairOffer =
                      viewerId !== null
                        ? findPairOffer(ladder.offers, viewerId, player.userId, responseHours)
                        : undefined;
                    const showAccept =
                      incomingChallenge?.status === "PENDING"
                      && playerIsViewer(player.userId, viewerId)
                      && incomingChallenge.toUserId === viewerId;
                    const matchStart = incomingChallenge?.scheduledAt
                      ? new Date(incomingChallenge.scheduledAt).getTime()
                      : null;
                    const nowMs = Date.now();
                    const showRecipientResult =
                      Boolean(incomingChallenge?.scheduledAt)
                      && playerIsViewer(player.userId, viewerId)
                      && incomingChallenge?.toUserId === viewerId
                      && !incomingChallenge?.proposedWinnerId
                      && matchStart !== null
                      && nowMs >= matchStart
                      && nowMs <= matchStart + RESULT_WINDOW_MS;
                    const showSchedule =
                      incomingChallenge != null
                      && player.userId === incomingChallenge.toUserId
                      && (incomingChallenge.status === "ACCEPTED" || incomingChallenge.status === "SCHEDULED")
                      && !incomingChallenge.scheduledAt
                      && (viewerId === incomingChallenge.fromUserId || viewerId === incomingChallenge.toUserId);
                    const showReschedule =
                      incomingChallenge != null
                      && player.userId === incomingChallenge.toUserId
                      && Boolean(incomingChallenge.scheduledAt)
                      && (incomingChallenge.status === "ACCEPTED" || incomingChallenge.status === "SCHEDULED")
                      && (viewerId === incomingChallenge.fromUserId || viewerId === incomingChallenge.toUserId);
                    const showForfeit =
                      Boolean(incomingChallenge?.scheduledAt)
                      && playerIsViewer(player.userId, viewerId)
                      && matchStart !== null
                      && nowMs >= matchStart
                      && !incomingChallenge?.proposedWinnerId;
                    const canOffer =
                      viewerId !== null
                      && myRank !== undefined
                      && !mySeat?.passive
                      && !viewerDefiOpen
                      && withinSpan
                      && !playerIsViewer(player.userId, viewerId)
                      && !player.passive
                      && !pairOffer
                      && !recipientHasOpenDefi(ladder.offers, player.userId, responseHours);
                    const isViewerRow = playerIsViewer(player.userId, viewerId);
                    const cancelOfferRow =
                      isViewerRow
                      && (
                        (outgoingChallenge && viewerId === outgoingChallenge.fromUserId)
                        || (incomingChallenge && viewerId === incomingChallenge.toUserId)
                      );
                    return (
                      <li
                        key={player.userId}
                        className={ladderPlayerRowClass({ isViewerRow, incomingChallenge: isViewerRow ? undefined : incomingChallenge })}
                      >
                        <Avatar first={player.firstName} last={player.lastName} photo={player.photoUrl} className="h-10 w-10 shrink-0 text-xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {player.rank}. {player.name}
                            {player.passive ? <span className="ml-2 text-xs font-normal text-muted">Pasif</span> : null}
                          </span>
                          {incomingChallenge ? (
                            <span className="mt-1 block text-xs font-semibold text-ink">
                              {incomingChallenge.fromName} · {incomingChallenge.toName}
                            </span>
                          ) : null}
                          {incomingChallenge?.status === "ACCEPTED" && incomingChallenge.acceptedAt ? (
                            <span className="mt-0.5 block text-xs text-muted">
                              <AcceptCountdown acceptedAt={incomingChallenge.acceptedAt} acceptDays={incomingChallenge.acceptDays} />
                            </span>
                          ) : null}
                          {incomingChallenge?.scheduledAt ? (
                            <span className="mt-0.5 block text-xs text-muted">
                              {new Date(incomingChallenge.scheduledAt).toLocaleString("tr-TR", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          ) : null}
                        </span>
                        {player.lastMove === "UP" ? (
                          <ArrowUp className="h-4 w-4 shrink-0 text-[#15803d]" aria-label="Yükseldi" />
                        ) : null}
                        {player.lastMove === "DOWN" ? (
                          <ArrowDown className="h-4 w-4 shrink-0 text-[#b91c1c]" aria-label="Düştü" />
                        ) : null}
                        {showAccept && incomingChallenge ? (
                          <button
                            type="button"
                            disabled={acceptingId === incomingChallenge.id}
                            onClick={() => void acceptOffer(incomingChallenge.id)}
                            className="court-press shrink-0 rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-60"
                          >
                            Kabul et
                          </button>
                        ) : null}
                        {(showSchedule || showReschedule) && incomingChallenge ? (
                          <span className="flex shrink-0 flex-wrap items-center gap-1">
                            <label className="sr-only" htmlFor={`schedule-${incomingChallenge.id}`}>
                              Tarih
                            </label>
                            <input
                              id={`schedule-${incomingChallenge.id}`}
                              type="datetime-local"
                              value={
                                scheduleDraftOfferId === incomingChallenge.id
                                  ? scheduleDraft
                                  : datetimeLocalValue(incomingChallenge.scheduledAt)
                              }
                              onChange={(event) => {
                                setScheduleDraftOfferId(incomingChallenge.id);
                                setScheduleDraft(event.target.value);
                              }}
                              className="h-8 rounded-md border border-line px-2 text-xs"
                            />
                            <button
                              type="button"
                              disabled={
                                schedulingId === incomingChallenge.id
                                || !(scheduleDraftOfferId === incomingChallenge.id ? scheduleDraft : incomingChallenge.scheduledAt)
                              }
                              onClick={() => {
                                const local =
                                  scheduleDraftOfferId === incomingChallenge.id
                                    ? scheduleDraft
                                    : datetimeLocalValue(incomingChallenge.scheduledAt);
                                void scheduleMatch(incomingChallenge.id, local);
                              }}
                              className="court-press rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-60"
                            >
                              Tarih
                            </button>
                          </span>
                        ) : null}
                        {showRecipientResult && incomingChallenge ? (
                          <span className="flex shrink-0 flex-wrap items-center gap-1">
                            <button
                              type="button"
                              disabled={resultingId === incomingChallenge.id}
                              onClick={() => void proposeResult(incomingChallenge.id, incomingChallenge.toUserId)}
                              className="court-press rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-60"
                            >
                              Kazandı
                            </button>
                            <button
                              type="button"
                              disabled={resultingId === incomingChallenge.id}
                              onClick={() => void proposeResult(incomingChallenge.id, incomingChallenge.fromUserId)}
                              className="court-press rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-60"
                            >
                              Kaybetti
                            </button>
                          </span>
                        ) : null}
                        {showForfeit && incomingChallenge ? (
                          <button
                            type="button"
                            disabled={resultingId === incomingChallenge.id}
                            onClick={() => void recordForfeit(incomingChallenge.id)}
                            className="court-press shrink-0 rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-60"
                          >
                            Hükmen
                          </button>
                        ) : null}
                        {cancelOfferRow && (outgoingChallenge ?? incomingChallenge) ? (
                          <button
                            type="button"
                            disabled={cancellingId === (outgoingChallenge ?? incomingChallenge)!.id}
                            onClick={() => void cancelOffer((outgoingChallenge ?? incomingChallenge)!.id)}
                            className="court-press shrink-0 rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-60"
                          >
                            İptal
                          </button>
                        ) : null}
                        {canOffer ? (
                          <button
                            type="button"
                            disabled={offeringId === player.userId}
                            onClick={() => void offerMatch(ladder.id, player, viewerId)}
                            className="court-press shrink-0 rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-60"
                          >
                            Teklif
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
      <LadderSide ladder={target} canManage={canManageLadder} onSaved={reloadLadders} />
    </div>
  );
}
