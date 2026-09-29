"use client";

import { COURT_PURPOSE_LABELS, type CourtPurpose } from "@club/shared";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import {
  type Person,
  type ReservationInfo,
  addHour,
  fullName,
  kindClass,
  reservationTone,
  shiftDate,
  takvimHref,
  weekdayOf,
} from "@/components/court-ui";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

type WeekSlot = {
  date: string;
  weekday: number;
  startTime: string;
  endTime: string;
  state: "free" | "reserved";
  reservation: ReservationInfo | null;
};
type Week = {
  court: { id: string; name: string; active: boolean; kind: "BALLOON" | "OUTDOOR"; kindLabel: string };
  weekStart: string;
  weekEnd: string;
  hours: string[];
  days: { date: string; weekday: number; label: string; short: string }[];
  viewer: { purposes: CourtPurpose[]; canApprove: boolean };
  slots: WeekSlot[];
};

export function CourtWeekView() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const focusDate = search.get("date");
  const focusHour = search.get("hour");
  const [week, setWeek] = useState<string | undefined>(search.get("week") ?? focusDate ?? undefined);
  const [focusApplied, setFocusApplied] = useState(false);
  const [draft, setDraft] = useState<{ date: string; startTime: string } | null>(null);
  const [purpose, setPurpose] = useState<CourtPurpose>("TRAINING");
  const [partnerId, setPartnerId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const path = user ? `/courts/${params.id}/week${week ? `?week=${week}` : ""}` : null;
  const board = useResource<Week>(path);
  const roster = useResource<{ data: Person[] }>(user && draft ? "/players/search?pageSize=50" : null);

  useEffect(() => {
    if (focusApplied || !focusDate || !focusHour || !board.data) return;
    const slot = board.data.slots.find((item) => item.date === focusDate && item.startTime === focusHour);
    if (!slot) {
      if (week !== focusDate) setWeek(focusDate);
      return;
    }
    document.getElementById(`cell-${focusDate}-${focusHour}`)?.scrollIntoView({ block: "center" });
    setFocusApplied(true);
  }, [focusApplied, focusDate, focusHour, board.data, week]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setMessage(null);
      await board.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "İşlem tamamlanamadı");
    } finally {
      setBusy(false);
    }
  }

  if (board.loading || !user) return <LoadingBlock label="Kort haftası yükleniyor" />;
  if (board.error || !board.data) return <ErrorState message={board.error ?? "Kort haftası açılmadı"} onRetry={() => void board.reload()} />;

  const data = board.data;
  const purposes = data.viewer.purposes;
  const chosen = purposes.includes(purpose) ? purpose : purposes[0] ?? "TRAINING";
  const people = (roster.data?.data ?? []).filter((person) => person.id !== user.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title={data.court.name}
        action={<Link href="/takvim" className="text-sm font-semibold text-court">Takvim</Link>}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          <Link href="/kortlar" className="font-semibold text-court">Tüm kortlar</Link>
          <span className={`ml-2 ${kindClass(data.court.kind)}`}>{data.court.kindLabel}</span>
          {data.court.active ? "" : " · pasif"}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setWeek(shiftDate(data.weekStart, -7))}>Önceki</Button>
          <p className="text-sm font-semibold">{data.weekStart} – {data.weekEnd}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setWeek(shiftDate(data.weekStart, 7))}>Sonraki</Button>
        </div>
      </div>
      <p className="text-sm text-muted">Boş saate dokun, bu kort için talep aç. Dolu saat Takvimde o saatin oyuncularını ve bütün kortları açar.</p>
      {message ? <p className="rounded-2xl bg-surface px-3 py-2 text-sm" role="status">{message}</p> : null}

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
                  <CourtCell
                    key={day.date}
                    slot={slot}
                    focused={focusDate === day.date && focusHour === hour}
                    busy={busy}
                    onEmpty={() => { setDraft({ date: day.date, startTime: hour }); setPartnerId(""); }}
                    onCheckIn={(reservationId) => void run(async () => {
                      await api(`/reservations/${reservationId}/check-in`, {
                        method: "POST",
                        body: JSON.stringify({ date: slot.date, startTime: slot.startTime }),
                      });
                      setMessage("Check-in alındı.");
                    })}
                  />
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
                <CourtCell
                  key={hour}
                  slot={slot}
                  focused={focusDate === day.date && focusHour === hour}
                  busy={busy}
                  onEmpty={() => { setDraft({ date: day.date, startTime: hour }); setPartnerId(""); }}
                  onCheckIn={(reservationId) => void run(async () => {
                    await api(`/reservations/${reservationId}/check-in`, {
                      method: "POST",
                      body: JSON.stringify({ date: slot.date, startTime: slot.startTime }),
                    });
                    setMessage("Check-in alındı.");
                  })}
                />
              );
            })}
          </section>
        ))}
      </div>

      {draft ? (
        <form
          className="space-y-3 rounded-3xl border border-line bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api("/reservations", {
                method: "POST",
                body: JSON.stringify({
                  courtId: data.court.id,
                  purpose: chosen,
                  startDate: draft.date,
                  endDate: draft.date,
                  weekdays: [weekdayOf(draft.date)],
                  startTime: draft.startTime,
                  endTime: addHour(draft.startTime),
                  partnerId: chosen === "MATCH" ? partnerId : null,
                }),
              });
              setDraft(null);
              setMessage(data.viewer.canApprove ? "Rezervasyon onaylı kaydedildi." : "Talep yönetici onayına düştü.");
            });
          }}
        >
          <h2 className="font-semibold">{data.court.name} · {draft.date} {draft.startTime}</h2>
          <Label htmlFor="week-purpose">Amaç</Label>
          <Select id="week-purpose" value={chosen} onChange={(event) => setPurpose(event.target.value as CourtPurpose)}>
            {purposes.map((item) => <option key={item} value={item}>{COURT_PURPOSE_LABELS[item]}</option>)}
          </Select>
          {chosen === "MATCH" ? (
            <>
              <Label htmlFor="week-partner">Rakip</Label>
              <Select id="week-partner" value={partnerId} onChange={(event) => setPartnerId(event.target.value)} required>
                <option value="">Oyuncu seç</option>
                {people.map((person) => <option key={person.id} value={person.id}>{fullName(person)}</option>)}
              </Select>
            </>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>Talep gönder</Button>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>Vazgeç</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function CourtCell({
  slot,
  focused,
  busy,
  onEmpty,
  onCheckIn,
}: {
  slot: WeekSlot;
  focused: boolean;
  busy: boolean;
  onEmpty: () => void;
  onCheckIn: (reservationId: string) => void;
}) {
  const ring = focused ? "ring-2 ring-court" : "";
  if (slot.state === "free" || !slot.reservation) {
    return (
      <button
        id={`cell-${slot.date}-${slot.startTime}`}
        type="button"
        className={`w-full rounded-2xl border border-line bg-surface px-2 py-2 text-left text-[11px] ${ring}`}
        onClick={onEmpty}
      >
        <span className="font-semibold">{slot.startTime}</span>
        <span className="mt-1 block text-muted">boş</span>
      </button>
    );
  }
  const reservation = slot.reservation;
  const players = reservation.players ?? [];
  return (
    <div id={`cell-${slot.date}-${slot.startTime}`} className={`w-full ${reservationTone(reservation.checkedIn)} ${ring}`}>
      <Link href={takvimHref(slot.date, slot.startTime)} className="block font-semibold underline-offset-2 hover:underline">
        {slot.startTime} · {reservation.purposeLabel}
      </Link>
      <p>{reservation.checkedIn ? "Check-in yapıldı" : "Check-in yok"}</p>
      {players.length > 0 ? <p>{players.map(fullName).join(" · ")}</p> : null}
      {reservation.canCheckIn ? (
        <Button type="button" size="sm" variant={reservation.checkedIn ? "outline" : "clay"} className="mt-2" disabled={busy} onClick={() => onCheckIn(reservation.id)}>Check-in</Button>
      ) : null}
    </div>
  );
}
