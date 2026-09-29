"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import {
  type CourtCell,
  type Person,
  type Reservation,
  type Slot,
  type SlotPerson,
  PendingQueue,
  addHour,
  courtWeekHref,
  endOptions,
  fullName,
  kindClass,
  reservationTone,
  shiftDate,
} from "@/components/court-ui";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

type Board = {
  weekStart: string;
  weekEnd: string;
  hours: string[];
  checkInLeadHours: number;
  viewer: { boardVisible: boolean; canApprove: boolean; purposes: string[] };
  days: { date: string; weekday: number; label: string; short: string }[];
  slots: Slot[];
};
type Offer = {
  id: string;
  date: string | null;
  startTime: string;
  from: Person;
  to: Person;
  canRespond: boolean;
};
type Range = { date: string; start: string; end: string };

function slotButtonClass(slot: Slot, selected: boolean): string {
  const tone = slot.green ? "border-court bg-court/15" : "border-line bg-surface";
  return `rounded-2xl border px-2 py-2 text-left text-[11px] ${tone} ${selected ? "ring-2 ring-court" : ""}`;
}

export function TakvimView() {
  const { user } = useAuth();
  const params = useSearchParams();
  const queryDate = params.get("date");
  const queryStart = params.get("start");
  const queryEnd = params.get("end");
  const [week, setWeek] = useState<string | undefined>(queryDate ?? undefined);
  const [range, setRange] = useState<Range | null>(null);
  const [queryApplied, setQueryApplied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const board = useResource<Board>(user ? `/courts/board${week ? `?week=${week}` : ""}` : null);
  const offers = useResource<{ data: Offer[] }>(user ? "/slot-offers?scope=incoming" : null);
  const requests = useResource<{ data: Reservation[] }>(user ? "/reservations?status=PENDING&pageSize=50" : null);

  useEffect(() => {
    if (queryApplied || !board.data || !queryDate || !queryStart) return;
    const inWeek = board.data.slots.some((slot) => slot.date === queryDate);
    if (!inWeek) {
      setWeek(queryDate);
      return;
    }
    if (!board.data.hours.includes(queryStart)) {
      setQueryApplied(true);
      return;
    }
    const end = queryEnd && queryEnd > queryStart && queryEnd <= "23:00" ? queryEnd : addHour(queryStart);
    setRange({ date: queryDate, start: queryStart, end });
    setQueryApplied(true);
  }, [queryApplied, board.data, queryDate, queryStart, queryEnd]);

  const rangeDate = range?.date;
  const rangeStart = range?.start;
  useEffect(() => {
    if (!rangeDate || !rangeStart) return;
    document.getElementById("takvim-panel")?.scrollIntoView({ block: "start" });
  }, [rangeDate, rangeStart]);

  async function refresh() {
    await Promise.all([board.reload(), offers.reload(), requests.reload()]);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setMessage(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "İşlem tamamlanamadı");
    } finally {
      setBusy(false);
    }
  }

  if (board.loading || !user) return <LoadingBlock label="Takvim yükleniyor" />;
  if (board.error || !board.data) return <ErrorState message={board.error ?? "Takvim açılmadı"} onRetry={() => void board.reload()} />;

  const data = board.data;
  const selected = range
    ? data.slots
        .filter((slot) => slot.date === range.date && slot.startTime >= range.start && slot.startTime < range.end)
        .sort((left, right) => left.startTime.localeCompare(right.startTime))
    : [];
  const dayLabel = data.days.find((day) => day.date === range?.date);
  const freeForRange = selected[0]
    ? selected[0].courts.filter((court) => selected.every((slot) => slot.courts.find((item) => item.id === court.id)?.state === "free"))
    : [];
  const selectedHours = new Set(selected.map((slot) => `${slot.date}-${slot.startTime}`));

  return (
    <div className="space-y-4">
      <PageHeader title="Takvim" action={<Link href="/kortlar" className="text-sm font-semibold text-court">Kortlar</Link>} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => { setWeek(shiftDate(data.weekStart, -7)); setRange(null); }}>Önceki</Button>
          <p className="text-sm font-semibold">{data.weekStart} – {data.weekEnd}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => { setWeek(shiftDate(data.weekStart, 7)); setRange(null); }}>Sonraki</Button>
        </div>
        <Button
          type="button"
          size="sm"
          variant={data.viewer.boardVisible ? "outline" : "clay"}
          disabled={busy}
          onClick={() => void run(async () => {
            await api("/me/board-visibility", { method: "PATCH", body: JSON.stringify({ visible: !data.viewer.boardVisible }) });
          })}
        >
          {data.viewer.boardVisible ? "Tahtada görünüyorsun" : "Tahtada gizlisin"}
        </Button>
      </div>
      <p className="text-sm text-muted">
        Yeşil saat: en az iki görünen oyuncu var ve içlerinden bir çiftin seviyesi en fazla 1 basamak ayrı. Bir saate dokun, aynı günde bitiş saatini seç. 18:00–21:00, 18, 19 ve 20’yi kapsar. Check-in, kort saatinden {data.checkInLeadHours} saat önce açılır.
      </p>
      {message ? <p className="rounded-2xl bg-surface px-3 py-2 text-sm" role="status">{message}</p> : null}

      {(offers.data?.data.length ?? 0) > 0 ? (
        <section className="space-y-2 rounded-3xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Sana gelen maç teklifleri</h2>
          {offers.data?.data.map((offer) => (
            <div key={offer.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p>{fullName(offer.from)} · {offer.date} {offer.startTime}</p>
              {offer.canRespond ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={busy} onClick={() => void run(async () => { await api(`/slot-offers/${offer.id}/accept`, { method: "POST" }); })}>Kabul et</Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { await api(`/slot-offers/${offer.id}/decline`, { method: "POST" }); })}>Reddet</Button>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <div className="hidden overflow-x-auto md:block">
        <div className="grid min-w-[760px] gap-1" style={{ gridTemplateColumns: "4.5rem repeat(7, minmax(0, 1fr))" }}>
          <div />
          {data.days.map((day) => (
            <div key={day.date} className="px-1 pb-1 text-center text-xs font-semibold">
              {day.short}
              <div className="font-normal text-muted">{day.date.slice(8)}</div>
            </div>
          ))}
          {data.hours.map((hour) => (
            <Fragment key={hour}>
              <div className="py-2 text-xs text-muted">{hour}</div>
              {data.days.map((day) => {
                const slot = data.slots.find((item) => item.date === day.date && item.startTime === hour);
                if (!slot) return <div key={day.date} />;
                return (
                  <button
                    key={day.date}
                    type="button"
                    className={slotButtonClass(slot, selectedHours.has(`${day.date}-${hour}`))}
                    onClick={() => setRange({ date: day.date, start: hour, end: addHour(hour) })}
                  >
                    <SlotMarks slot={slot} />
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {data.days.map((day) => (
          <section key={day.date} className="space-y-1">
            <h2 className="text-sm font-semibold">{day.label}</h2>
            {data.hours.map((hour) => {
              const slot = data.slots.find((item) => item.date === day.date && item.startTime === hour);
              if (!slot) return null;
              return (
                <button
                  key={hour}
                  type="button"
                  className={`flex w-full items-center justify-between ${slotButtonClass(slot, selectedHours.has(`${day.date}-${hour}`))}`}
                  onClick={() => setRange({ date: day.date, start: hour, end: addHour(hour) })}
                >
                  <span className="font-semibold">{hour}</span>
                  <SlotMarks slot={slot} />
                </button>
              );
            })}
          </section>
        ))}
      </div>

      {range && selected.length > 0 ? (
        <section id="takvim-panel" className="space-y-4 rounded-3xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">{dayLabel?.label ?? range.date}</h2>
              <p className="text-sm text-muted">{range.start}–{range.end} · {selected.map((slot) => slot.startTime.slice(0, 2)).join(", ")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="range-start-hour">Başlangıç</Label>
                <Select
                  id="range-start-hour"
                  value={range.start}
                  onChange={(event) => {
                    const start = event.target.value;
                    const end = range.end > start ? range.end : addHour(start);
                    setRange({ ...range, start, end });
                  }}
                >
                  {data.hours.map((hour) => <option key={hour} value={hour}>{hour}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="range-end-hour">Bitiş</Label>
                <Select id="range-end-hour" value={range.end} onChange={(event) => setRange({ ...range, end: event.target.value })}>
                  {endOptions(range.start).map((hour) => <option key={hour} value={hour}>{hour}</option>)}
                </Select>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Aralığın tamamında boş kortlar</h3>
            <p className="mt-1 text-sm text-muted">Bir kort ancak seçilen her saatte boşsa burada durur.</p>
            {freeForRange.length === 0 ? <p className="mt-2 text-sm">Bu aralıkta boş kort yok.</p> : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {freeForRange.map((court) => (
                  <li key={court.id}>
                    <Link href={courtWeekHref(court.id, data.weekStart, range.date, range.start)} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                      {court.name}
                      <span className={kindClass(court.kind)}>{court.kindLabel}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selected.map((slot) => (
            <HourBlock
              key={slot.startTime}
              slot={slot}
              weekStart={data.weekStart}
              viewerId={user.id}
              busy={busy}
              onOffer={(toUserId) => void run(async () => {
                await api("/slot-offers", { method: "POST", body: JSON.stringify({ toUserId, date: slot.date, startTime: slot.startTime }) });
                setMessage("Maç teklifi gönderildi.");
              })}
              onCheckIn={(reservationId) => void run(async () => {
                await api(`/reservations/${reservationId}/check-in`, {
                  method: "POST",
                  body: JSON.stringify({ date: slot.date, startTime: slot.startTime }),
                });
                setMessage("Check-in alındı.");
              })}
            />
          ))}
        </section>
      ) : (
        <p className="text-sm text-muted">Bir saate dokun. Müsait oyuncuları ve on iki kortu görürsün.</p>
      )}

      <PendingQueue
        items={requests.data?.data ?? []}
        canApprove={data.viewer.canApprove}
        busy={busy}
        onApprove={(id) => void run(async () => { await api(`/reservations/${id}/approve`, { method: "POST" }); })}
        onReject={(id) => void run(async () => { await api(`/reservations/${id}/reject`, { method: "POST" }); })}
      />
    </div>
  );
}

function SlotMarks({ slot }: { slot: Slot }) {
  const reserved = slot.courts.filter((court) => court.state === "reserved");
  return (
    <span className="flex flex-col gap-1">
      {slot.green ? <span className="font-semibold text-court">Uygun</span> : <span className="text-muted">—</span>}
      {reserved.length > 0 ? <span className="text-muted">{reserved.length} dolu</span> : null}
    </span>
  );
}

function HourBlock({
  slot,
  weekStart,
  viewerId,
  busy,
  onOffer,
  onCheckIn,
}: {
  slot: Slot;
  weekStart: string;
  viewerId: string;
  busy: boolean;
  onOffer: (toUserId: string) => void;
  onCheckIn: (reservationId: string) => void;
}) {
  return (
    <div className="space-y-3 border-t border-line pt-3">
      <h3 className="font-semibold">{slot.startTime}–{slot.endTime}{slot.green ? " · uygun" : ""}</h3>
      <div>
        <h4 className="text-sm font-semibold">Müsait oyuncular</h4>
        {slot.people.length === 0 ? <p className="mt-1 text-sm text-muted">Bu saatte görünen müsait oyuncu yok.</p> : null}
        <ul className="mt-2 space-y-2">
          {slot.people.map((person) => (
            <PersonRow key={person.id} person={person} viewerId={viewerId} busy={busy} onOffer={onOffer} />
          ))}
        </ul>
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Kortlar</h4>
        {slot.courts.length === 0 ? <p className="text-sm text-muted">Aktif kort yok.</p> : null}
        {slot.courts.map((court) => (
          <CourtHourRow
            key={court.id}
            court={court}
            href={courtWeekHref(court.id, weekStart, slot.date, slot.startTime)}
            busy={busy}
            onCheckIn={onCheckIn}
          />
        ))}
      </div>
    </div>
  );
}

function PersonRow({ person, viewerId, busy, onOffer }: { person: SlotPerson; viewerId: string; busy: boolean; onOffer: (id: string) => void }) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span>{fullName(person)} · {person.levelLabel}</span>
      {person.id !== viewerId ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onOffer(person.id)}>Maç teklif et</Button>
      ) : (
        <span className="text-xs text-muted">Sen</span>
      )}
    </li>
  );
}

function CourtHourRow({
  court,
  href,
  busy,
  onCheckIn,
}: {
  court: CourtCell;
  href: string;
  busy: boolean;
  onCheckIn: (reservationId: string) => void;
}) {
  if (court.state === "free" || !court.reservation) {
    return (
      <p className="rounded-2xl border border-line px-3 py-2 text-sm">
        <Link href={href} className="font-semibold underline-offset-2 hover:underline">{court.name}</Link>
        <span className={`ml-2 ${kindClass(court.kind)}`}>{court.kindLabel}</span>
        <span> · boş</span>
      </p>
    );
  }
  const reservation = court.reservation;
  const players = reservation.players ?? [];
  return (
    <div className={reservationTone(reservation.checkedIn)}>
      <p>
        <Link href={href} className="font-semibold underline-offset-2 hover:underline">{court.name}</Link>
        <span className="ml-2">{court.kindLabel}</span>
        <span> · {reservation.purposeLabel}</span>
      </p>
      <p>{reservation.checkedIn ? "Check-in yapıldı" : "Check-in yok"}</p>
      {players.length > 0 ? <p>{players.map(fullName).join(" · ")}</p> : null}
      {reservation.canCheckIn ? (
        <Button type="button" size="sm" variant={reservation.checkedIn ? "outline" : "clay"} className="mt-2" disabled={busy} onClick={() => onCheckIn(reservation.id)}>Check-in</Button>
      ) : reservation.checkInHint ? <p className="mt-1 text-xs opacity-80">{reservation.checkInHint}</p> : null}
    </div>
  );
}
