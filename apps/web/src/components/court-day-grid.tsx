"use client";

import { COURT_PURPOSE_LABELS, type CourtPurpose } from "@club/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { type CourtRow, type Person, addHour, fullName, shiftDate, weekdayOf } from "@/components/court-ui";
import { ErrorState, LoadingBlock } from "@/components/states";

export type DayReservation = {
  id: string;
  status: "PENDING" | "APPROVED";
  statusLabel: string;
  purpose: CourtPurpose;
  purposeLabel: string;
  checkedIn: boolean;
  canCheckIn: boolean;
  checkInHint: string | null;
  players: Person[] | null;
};

export type DayCell = {
  courtId: string;
  startTime: string;
  endTime: string;
  state: "free" | "busy";
  reservation: DayReservation | null;
};

export type DayGrid = {
  date: string;
  weekday: number;
  label: string;
  short: string;
  hours: string[];
  courts: CourtRow[];
  viewer: { canApprove: boolean; purposes: CourtPurpose[] };
  cells: DayCell[];
};

type ReserveBody = {
  courtId: string;
  purpose: CourtPurpose;
  startDate: string;
  endDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  partnerId: string | null;
};

export function CourtDayGrid({
  date,
  onDate,
  grid,
  loading,
  error,
  onRetry,
  selectedCourtId,
  onSelectCourt,
  people,
  busy,
  onReserve,
  onCheckIn,
}: {
  date: string;
  onDate: (date: string) => void;
  grid: DayGrid | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedCourtId: string | null;
  onSelectCourt: (courtId: string) => void;
  people: Person[];
  busy: boolean;
  onReserve: (body: ReserveBody) => Promise<boolean>;
  onCheckIn: (reservationId: string, date: string, startTime: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<{ courtId: string; startTime: string } | null>(null);
  const [detail, setDetail] = useState<{ courtId: string; startTime: string } | null>(null);
  const [purpose, setPurpose] = useState<CourtPurpose>("TRAINING");
  const [partnerId, setPartnerId] = useState("");

  useEffect(() => {
    setDraft(null);
    setDetail(null);
  }, [date]);

  useEffect(() => {
    if (!selectedCourtId) return;
    document.getElementById(`day-col-${selectedCourtId}`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selectedCourtId, grid?.date]);

  useEffect(() => {
    if (!draft && !detail) return;
    document.getElementById("day-panel")?.scrollIntoView({ block: "nearest" });
  }, [draft, detail]);

  const purposes = grid?.viewer.purposes ?? [];
  const chosen = purposes.includes(purpose) ? purpose : purposes[0] ?? "TRAINING";
  const cells = new Map((grid?.cells ?? []).map((cell) => [`${cell.courtId}-${cell.startTime}`, cell]));
  const draftCourt = grid?.courts.find((court) => court.id === draft?.courtId) ?? null;
  const detailCell = detail ? cells.get(`${detail.courtId}-${detail.startTime}`) : undefined;
  const detailCourt = grid?.courts.find((court) => court.id === detail?.courtId) ?? null;
  const detailReservation = detailCell?.state === "busy" ? detailCell.reservation : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onDate(shiftDate(date, -1))}>Önceki gün</Button>
        <div>
          <Label htmlFor="kort-gun">Gün</Label>
          <Input
            id="kort-gun"
            type="date"
            value={date}
            onChange={(event) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onDate(event.target.value);
            }}
            className="h-9 w-[11.5rem]"
          />
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => onDate(shiftDate(date, 1))}>Sonraki gün</Button>
        {grid ? <p className="pb-2 text-sm font-semibold">{grid.label}</p> : null}
      </div>

      {loading ? <LoadingBlock label="Gün tablosu yükleniyor" /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={onRetry} /> : null}

      {grid && !loading && !error ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-max min-w-full border-separate border-spacing-[2px] text-left">
              <caption className="sr-only">{grid.label} {grid.date}, saatler 08:00–22:00</caption>
              <thead>
                <tr>
                  <th className="w-14" />
                  {grid.courts.map((court) => {
                    const selected = court.id === selectedCourtId;
                    const balloon = court.kind === "BALLOON";
                    return (
                      <th
                        key={court.id}
                        id={`day-col-${court.id}`}
                        scope="col"
                        className={`min-w-[4.75rem] border-2 px-1 py-1 text-center text-[11px] font-semibold leading-tight whitespace-nowrap ${balloon ? "border-[#2563eb] bg-[#eff6ff]" : "border-court bg-court/10"} ${selected ? "ring-2 ring-clay ring-inset" : ""}`}
                      >
                        <button type="button" className="w-full" aria-pressed={selected} onClick={() => onSelectCourt(court.id)}>
                          {court.name}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {grid.hours.map((hour) => (
                  <tr key={hour}>
                    <th scope="row" className="w-14 pr-1 text-right text-[11px] font-medium whitespace-nowrap text-muted">{hour}</th>
                    {grid.courts.map((court) => {
                      const cell = cells.get(`${court.id}-${hour}`);
                      const selected = court.id === selectedCourtId;
                      const busyCell = cell?.state === "busy" && cell.reservation;
                      const label = busyCell
                        ? `${court.name} ${hour} dolu ${cell.reservation?.purposeLabel ?? ""}`.trim()
                        : `${court.name} ${hour} boş`;
                      return (
                        <td key={court.id} className="p-0">
                          <button
                            type="button"
                            aria-label={label}
                            className={`min-h-9 w-full rounded-[3px] px-0.5 py-1 text-center text-[10px] leading-tight ${busyCell ? "bg-court font-semibold text-white" : "bg-[#c8efd4] text-court-deep"} ${selected ? "ring-2 ring-clay ring-inset" : ""}`}
                            onClick={() => {
                              if (busyCell) {
                                setDraft(null);
                                setDetail((current) => current?.courtId === court.id && current.startTime === hour ? null : { courtId: court.id, startTime: hour });
                                return;
                              }
                              setDetail(null);
                              setPartnerId("");
                              setDraft((current) => current?.courtId === court.id && current.startTime === hour ? null : { courtId: court.id, startTime: hour });
                            }}
                          >
                            {busyCell ? (
                              <>
                                <span className="block">dolu</span>
                                {cell.reservation?.purposeLabel ? <span className="block font-normal">{cell.reservation.purposeLabel}</span> : null}
                              </>
                            ) : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {draft && draftCourt ? (
            <form
              id="day-panel"
              className="space-y-3 rounded-3xl border border-line bg-surface p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draftCourt.active) return;
                void onReserve({
                  courtId: draftCourt.id,
                  purpose: chosen,
                  startDate: date,
                  endDate: date,
                  weekdays: [weekdayOf(date)],
                  startTime: draft.startTime,
                  endTime: addHour(draft.startTime),
                  partnerId: chosen === "MATCH" ? partnerId : null,
                }).then((ok) => {
                  if (ok) setDraft(null);
                });
              }}
            >
              <h2 className="font-semibold">{draftCourt.name} · {date} {draft.startTime}–{addHour(draft.startTime)}</h2>
              {draftCourt.active ? (
                <p className="text-sm text-muted">Boş saat. Talep onaylanınca bu hücre dolu olur.</p>
              ) : (
                <p className="text-sm text-muted">Bu kort pasif. Talep açılamaz.</p>
              )}
              <Label htmlFor="day-purpose">Amaç</Label>
              <Select id="day-purpose" value={chosen} onChange={(event) => setPurpose(event.target.value as CourtPurpose)}>
                {purposes.map((item) => <option key={item} value={item}>{COURT_PURPOSE_LABELS[item]}</option>)}
              </Select>
              {chosen === "MATCH" ? (
                <>
                  <Label htmlFor="day-partner">Rakip</Label>
                  <Select id="day-partner" value={partnerId} onChange={(event) => setPartnerId(event.target.value)} required>
                    <option value="">Oyuncu seç</option>
                    {people.map((person) => <option key={person.id} value={person.id}>{fullName(person)}</option>)}
                  </Select>
                </>
              ) : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || !draftCourt.active}>
                  {grid.viewer.canApprove ? "Kaydet" : "Talep gönder"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>Vazgeç</Button>
              </div>
            </form>
          ) : null}

          {detail && detailCourt && detailReservation ? (
            <section id="day-panel" className="space-y-2 rounded-3xl border border-line bg-surface p-4 text-sm">
              <h2 className="font-semibold">{detailCourt.name} · {date} {detail.startTime}</h2>
              <p>dolu · {detailReservation.purposeLabel} · {detailReservation.statusLabel}</p>
              {detailReservation.players && detailReservation.players.length > 0 ? (
                <p>{detailReservation.players.map(fullName).join(" · ")}</p>
              ) : null}
              {detailReservation.checkedIn ? <p>Check-in yapıldı</p> : null}
              {detailReservation.checkInHint ? <p className="text-muted">{detailReservation.checkInHint}</p> : null}
              <div className="flex gap-2">
                {detailReservation.canCheckIn ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="clay"
                    disabled={busy}
                    onClick={() => void onCheckIn(detailReservation.id, date, detail.startTime)}
                  >
                    Check-in
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="outline" onClick={() => setDetail(null)}>Kapat</Button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
