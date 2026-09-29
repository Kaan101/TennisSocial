"use client";

import type { CourtPurpose } from "@club/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { type CourtRow, type Person, type Reservation, addHour, fullName, shiftDate } from "@/components/court-ui";
import { Label, Select } from "@/components/ui/input";
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

export type DaySlot = { courtId: string; startTime: string };

const PURPOSE_OPTIONS: { purpose: CourtPurpose; label: string; text: string; bg: string; chip: string }[] = [
  { purpose: "MATCH", label: "Maç", text: "text-[#1d4ed8]", bg: "bg-[#e7f0ff]", chip: "bg-[#dbeafe] text-[#1d4ed8]" },
  { purpose: "TRAINING", label: "Antrenman", text: "text-[#047857]", bg: "bg-[#d8f5e6]", chip: "bg-[#d1fae5] text-[#047857]" },
  { purpose: "TOURNAMENT", label: "Turnuva", text: "text-[#6d28d9]", bg: "bg-[#f3e8ff]", chip: "bg-[#ede9fe] text-[#6d28d9]" },
  { purpose: "MAINTENANCE", label: "Bakım", text: "text-[#c2410c]", bg: "bg-[#ffedd5]", chip: "bg-[#ffedd5] text-[#c2410c]" },
];

function purposeOption(purpose: CourtPurpose) {
  return PURPOSE_OPTIONS.find((item) => item.purpose === purpose) ?? PURPOSE_OPTIONS[1]!;
}

export function purposeWord(purpose: CourtPurpose): string {
  return purposeOption(purpose).label;
}

function cellKey(courtId: string, startTime: string): string {
  return `${courtId}|${startTime}`;
}

function hoursUntil(startTime: string, endTime: string): string[] {
  const hours: string[] = [];
  let cursor = startTime;
  while (cursor < endTime && cursor <= "22:00") {
    hours.push(cursor);
    cursor = addHour(cursor);
  }
  return hours;
}

export function groupDaySlots(slots: DaySlot[]): { courtId: string; startTime: string; endTime: string }[] {
  const byCourt = new Map<string, string[]>();
  for (const slot of slots) {
    const list = byCourt.get(slot.courtId) ?? [];
    list.push(slot.startTime);
    byCourt.set(slot.courtId, list);
  }
  const spans: { courtId: string; startTime: string; endTime: string }[] = [];
  for (const [courtId, times] of byCourt) {
    const sorted = [...new Set(times)].sort();
    let start = sorted[0];
    let previous = sorted[0];
    if (!start || !previous) continue;
    for (const time of sorted.slice(1)) {
      if (addHour(previous) === time) {
        previous = time;
        continue;
      }
      spans.push({ courtId, startTime: start, endTime: addHour(previous) });
      start = time;
      previous = time;
    }
    spans.push({ courtId, startTime: start, endTime: addHour(previous) });
  }
  return spans;
}

export function paintDayGrid(grid: DayGrid, created: Reservation): DayGrid {
  if (grid.date < created.startDate || grid.date > created.endDate) return grid;
  if (!created.weekdays.includes(grid.weekday)) return grid;
  const hours = new Set(hoursUntil(created.startTime, created.endTime));
  const status = created.status === "APPROVED" ? "APPROVED" : "PENDING";
  return {
    ...grid,
    cells: grid.cells.map((cell) => {
      if (cell.courtId !== created.courtId || !hours.has(cell.startTime)) return cell;
      const players = created.purpose === "MAINTENANCE"
        ? []
        : [created.holder, created.partner].filter((person): person is Person => Boolean(person));
      return {
        ...cell,
        state: "busy",
        reservation: {
          id: created.id,
          status,
          statusLabel: status === "APPROVED" ? "onaylı" : "beklemede",
          purpose: created.purpose,
          purposeLabel: created.purposeLabel,
          checkedIn: false,
          canCheckIn: false,
          checkInHint: null,
          players,
        },
      };
    }),
  };
}

export function CourtDayGrid({
  date,
  onDate,
  grid,
  loading,
  error,
  onRetry,
  people,
  busy,
  onApply,
  onCheckIn,
}: {
  date: string;
  onDate: (date: string) => void;
  grid: DayGrid | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  people: Person[];
  busy: boolean;
  onApply: (input: { purpose: CourtPurpose; slots: DaySlot[]; partnerId: string | null }) => Promise<boolean>;
  onCheckIn: (reservationId: string, date: string, startTime: string) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openCourtId, setOpenCourtId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ courtId: string; startTime: string } | null>(null);
  const [partnerId, setPartnerId] = useState("");
  const [askPartner, setAskPartner] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setDetail(null);
    setAskPartner(false);
    setOpenCourtId(null);
  }, [date]);

  useEffect(() => {
    if (!grid) return;
    setSelected((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const key of current) {
        const [courtId, startTime] = key.split("|");
        const cell = grid.cells.find((item) => item.courtId === courtId && item.startTime === startTime);
        if (cell?.state === "free") next.add(key);
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [grid]);

  const cells = new Map((grid?.cells ?? []).map((cell) => [`${cell.courtId}-${cell.startTime}`, cell]));
  const detailCell = detail ? cells.get(`${detail.courtId}-${detail.startTime}`) : undefined;
  const detailCourt = grid?.courts.find((court) => court.id === detail?.courtId) ?? null;
  const detailReservation = detailCell?.state === "busy" ? detailCell.reservation : null;

  function toggleSlot(courtId: string, startTime: string) {
    const key = cellKey(courtId, startTime);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCourt(courtId: string) {
    if (!grid) return;
    const court = grid.courts.find((item) => item.id === courtId);
    if (!court?.active) return;
    const keys = grid.hours
      .filter((hour) => cells.get(`${courtId}-${hour}`)?.state !== "busy")
      .map((hour) => cellKey(courtId, hour));
    setSelected((current) => {
      const next = new Set(current);
      const allOn = keys.length > 0 && keys.every((key) => next.has(key));
      for (const key of keys) {
        if (allOn) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function onCell(court: CourtRow, hour: string) {
    const cell = cells.get(`${court.id}-${hour}`);
    if (cell?.state === "busy" && cell.reservation) {
      setDetail((current) => current?.courtId === court.id && current.startTime === hour ? null : { courtId: court.id, startTime: hour });
      return;
    }
    if (!court.active) return;
    toggleSlot(court.id, hour);
  }

  async function apply(purpose: CourtPurpose) {
    if (purpose === "MATCH" && !partnerId) {
      setAskPartner(true);
      return;
    }
    const slots = [...selected].flatMap((key) => {
      const [courtId, startTime] = key.split("|");
      if (!courtId || !startTime) return [];
      if (cells.get(`${courtId}-${startTime}`)?.state === "busy") return [];
      return [{ courtId, startTime }];
    });
    if (slots.length === 0) return;
    const ok = await onApply({
      purpose,
      slots,
      partnerId: purpose === "MATCH" ? partnerId : null,
    });
    if (ok) {
      setSelected(new Set());
      setAskPartner(false);
      setPartnerId("");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          aria-label="Önceki gün"
          onClick={() => onDate(shiftDate(date, -1))}
          className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface hover:bg-paper-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <Label htmlFor="kort-gun">Gün</Label>
          <input
            id="kort-gun"
            type="date"
            value={date}
            onChange={(event) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onDate(event.target.value);
            }}
            className="h-9 w-[11.5rem] rounded-2xl border border-line bg-surface px-3 text-sm"
          />
        </div>
        <button
          type="button"
          aria-label="Sonraki gün"
          onClick={() => onDate(shiftDate(date, 1))}
          className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface hover:bg-paper-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {grid ? <p className="pb-2 text-sm font-semibold">{grid.label}</p> : null}
      </div>

      {selected.size > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Amaç">
            {PURPOSE_OPTIONS.map((option) => (
              <button
                key={option.purpose}
                type="button"
                disabled={busy}
                onClick={() => void apply(option.purpose)}
                className={`rounded-full px-4 py-2 text-sm font-semibold hover:brightness-95 disabled:opacity-50 ${option.chip}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {askPartner ? (
            <div>
              <Label htmlFor="day-partner">Rakip</Label>
              <Select id="day-partner" value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
                <option value="">Oyuncu seç</option>
                {people.map((person) => <option key={person.id} value={person.id}>{fullName(person)}</option>)}
              </Select>
              <p className="mt-1 text-sm text-muted">Maç için rakip seç, sonra Maç’a tekrar dokun.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? <LoadingBlock label="Gün tablosu yükleniyor" /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={onRetry} /> : null}

      {grid && !loading && !error ? (
        <>
          <div className="space-y-2 md:hidden">
            {grid.courts.map((court) => {
              const open = openCourtId === court.id;
              const balloon = court.kind === "BALLOON";
              return (
                <section key={court.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenCourtId(open ? null : court.id)}
                    className={`flex w-full items-center justify-between px-3 py-3 text-left hover:bg-paper ${balloon ? "border-l-4 border-l-[#2563eb]" : "border-l-4 border-l-court"}`}
                  >
                    <span className="font-semibold">{court.name}</span>
                    <span className="text-xs text-muted">{open ? "Gizle" : "Saatler"}</span>
                  </button>
                  {open ? (
                    <div className="grid gap-[2px] px-2 pb-2">
                      {grid.hours.map((hour) => (
                        <div key={hour} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-stretch gap-[2px]">
                          <span className="self-center text-right text-[11px] text-muted">{hour}</span>
                          <SlotButton
                            court={court}
                            hour={hour}
                            cell={cells.get(`${court.id}-${hour}`)}
                            selected={selected.has(cellKey(court.id, hour))}
                            onClick={() => onCell(court, hour)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-max min-w-full border-separate border-spacing-[2px] text-left">
              <caption className="sr-only">{grid.label} {grid.date}, saatler 08:00–22:00</caption>
              <thead>
                <tr>
                  <th className="w-14" />
                  {grid.courts.map((court) => {
                    const balloon = court.kind === "BALLOON";
                    return (
                      <th
                        key={court.id}
                        scope="col"
                        className={`min-w-[5.25rem] border-2 px-1 py-1 text-center text-[11px] font-semibold leading-tight whitespace-nowrap hover:brightness-95 ${balloon ? "border-[#2563eb] bg-[#eff6ff]" : "border-court bg-court/10"}`}
                      >
                        <button type="button" className="w-full" onClick={() => toggleCourt(court.id)}>
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
                    {grid.courts.map((court) => (
                      <td key={court.id} className="p-0">
                        <SlotButton
                          court={court}
                          hour={hour}
                          cell={cells.get(`${court.id}-${hour}`)}
                          selected={selected.has(cellKey(court.id, hour))}
                          onClick={() => onCell(court, hour)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail && detailCourt && detailReservation ? (
            <section className="space-y-2 rounded-3xl border border-line bg-surface p-4 text-sm">
              <h2 className="font-semibold">{detailCourt.name} · {date} {detail.startTime}</h2>
              <p className={purposeOption(detailReservation.purpose).text}>{purposeWord(detailReservation.purpose)}</p>
              <p>{detailReservation.status === "APPROVED" ? "Onaylı" : "Onay bekliyor"}</p>
              {detailReservation.players && detailReservation.players.length > 0 ? (
                <p>{detailReservation.players.map(fullName).join(" · ")}</p>
              ) : null}
              {detailReservation.checkedIn ? <p>Check-in yapıldı</p> : null}
              {detailReservation.checkInHint ? <p className="text-muted">{detailReservation.checkInHint}</p> : null}
              <div className="flex gap-2">
                {detailReservation.canCheckIn ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-full bg-court px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => void onCheckIn(detailReservation.id, date, detail.startTime)}
                  >
                    Check-in
                  </button>
                ) : null}
                <button type="button" className="rounded-full border border-line bg-surface px-3 py-2 text-xs font-semibold" onClick={() => setDetail(null)}>
                  Kapat
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SlotButton({
  court,
  hour,
  cell,
  selected,
  onClick,
}: {
  court: CourtRow;
  hour: string;
  cell: DayCell | undefined;
  selected: boolean;
  onClick: () => void;
}) {
  const reservation = cell?.state === "busy" ? cell.reservation : null;
  const option = reservation ? purposeOption(reservation.purpose) : null;
  const label = reservation
    ? `${court.name} ${hour} ${option?.label ?? ""}`.trim()
    : `${court.name} ${hour}${selected ? " seçili" : " boş"}`;
  const tone = reservation
    ? `${option?.bg ?? ""} ${option?.text ?? ""} font-semibold hover:brightness-95`
    : selected
      ? "bg-[#8fcea6] text-court-deep hover:bg-[#7fc49a]"
      : "bg-[#c8efd4] text-court-deep hover:bg-[#b7e4c8]";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={reservation ? undefined : selected}
      onClick={onClick}
      className={`min-h-9 w-full rounded-[3px] px-1 py-1 text-center text-[11px] leading-tight ${tone}`}
    >
      {option ? option.label : null}
    </button>
  );
}
