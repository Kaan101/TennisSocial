"use client";

import type { CourtPurpose } from "@club/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { type CourtRow, type Person, type Reservation, addHour, shiftDate } from "@/components/court-ui";
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

const PURPOSE_OPTIONS: { purpose: CourtPurpose; label: string; text: string; bg: string; idle: string; on: string }[] = [
  { purpose: "MATCH", label: "Maç", text: "text-[#1d4ed8]", bg: "bg-[#e7f0ff]", idle: "bg-[#dbeafe] text-[#1d4ed8]", on: "bg-[#1d4ed8] text-white" },
  { purpose: "TRAINING", label: "Antrenman", text: "text-[#047857]", bg: "bg-[#d8f5e6]", idle: "bg-[#d1fae5] text-[#047857]", on: "bg-[#047857] text-white" },
  { purpose: "TOURNAMENT", label: "Turnuva", text: "text-[#6d28d9]", bg: "bg-[#f3e8ff]", idle: "bg-[#ede9fe] text-[#6d28d9]", on: "bg-[#6d28d9] text-white" },
  { purpose: "MAINTENANCE", label: "Bakım", text: "text-[#c2410c]", bg: "bg-[#ffedd5]", idle: "bg-[#ffedd5] text-[#c2410c]", on: "bg-[#c2410c] text-white" },
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

function shortCourtLabel(name: string): string {
  const indoor = name.match(/^Kapalı\s+(\d+)$/u);
  if (indoor?.[1]) return `K${indoor[1]}`;
  const outdoor = name.match(/^Kort\s+(\d+)$/u);
  if (outdoor?.[1]) return outdoor[1];
  return name;
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

function headerTone(balloon: boolean): string {
  return balloon
    ? "border-[#1d4ed8] bg-[#60a5fa] text-[#172554]"
    : "border-[#047857] bg-[#34d399] text-[#064e3b]";
}

export function CourtDayGrid({
  date,
  onDate,
  grid,
  loading,
  error,
  onRetry,
  busy,
  onApply,
  onCancel,
  onCheckIn,
}: {
  date: string;
  onDate: (date: string) => void;
  grid: DayGrid | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  busy: boolean;
  onApply: (input: { purpose: CourtPurpose; slots: DaySlot[] }) => Promise<void>;
  onCancel: (reservationIds: string[]) => Promise<void>;
  onCheckIn: (slots: { reservationId: string; date: string; startTime: string }[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purpose, setPurpose] = useState<CourtPurpose | null>(null);
  const [openCourtId, setOpenCourtId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(new Set());
    setOpenCourtId(null);
    setActionError(null);
  }, [date]);

  const cells = new Map((grid?.cells ?? []).map((cell) => [`${cell.courtId}-${cell.startTime}`, cell]));
  const picked = [...selected].flatMap((key) => {
    const [courtId, startTime] = key.split("|");
    if (!courtId || !startTime) return [];
    const cell = cells.get(`${courtId}-${startTime}`);
    if (!cell) return [];
    return [{ courtId, startTime, cell }];
  });
  const freeSlots = picked.filter((item) => item.cell.state !== "busy").map(({ courtId, startTime }) => ({ courtId, startTime }));
  const reservedSlots = picked.filter((item) => item.cell.state === "busy" && item.cell.reservation);
  const reservedOnly = picked.length > 0 && freeSlots.length === 0;

  function toggleSlot(courtId: string, startTime: string) {
    const key = cellKey(courtId, startTime);
    setActionError(null);
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
    if (cell?.state !== "busy" && !court.active) return;
    toggleSlot(court.id, hour);
  }

  async function rezerv() {
    if (!purpose || freeSlots.length === 0) return;
    setActionError(null);
    try {
      await onApply({ purpose, slots: freeSlots });
      setSelected(new Set());
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı");
    }
  }

  async function cancelSelected() {
    const ids = [...new Set(reservedSlots.flatMap((item) => item.cell.reservation ? [item.cell.reservation.id] : []))];
    if (ids.length === 0) return;
    setActionError(null);
    try {
      await onCancel(ids);
      setSelected(new Set());
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı");
    }
  }

  async function checkInSelected() {
    const slots = reservedSlots.flatMap((item) => item.cell.reservation
      ? [{ reservationId: item.cell.reservation.id, date, startTime: item.startTime }]
      : []);
    if (slots.length === 0) return;
    setActionError(null);
    try {
      await onCheckIn(slots);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı");
    }
  }

  const openCourt = grid?.courts.find((court) => court.id === openCourtId) ?? null;

  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          aria-label="Önceki gün"
          onClick={() => onDate(shiftDate(date, -1))}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-surface hover:bg-paper-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          aria-label="Gün"
          type="date"
          value={date}
          onChange={(event) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onDate(event.target.value);
          }}
          className="h-8 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2 text-sm"
        />
        <button
          type="button"
          aria-label="Sonraki gün"
          onClick={() => onDate(shiftDate(date, 1))}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-surface hover:bg-paper-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {grid ? <span className="min-w-0 truncate text-sm font-semibold">{grid.label}</span> : null}
      </div>

      <div className="grid grid-cols-4 gap-1" role="group" aria-label="Amaç">
        {PURPOSE_OPTIONS.map((option) => {
          const on = purpose === option.purpose;
          return (
            <button
              key={option.purpose}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => { setPurpose(option.purpose); setActionError(null); }}
              className={`min-w-0 truncate rounded-full px-1 py-1.5 text-[11px] font-semibold sm:text-xs ${on ? option.on : option.idle}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="pt-1">
        {reservedOnly ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => void cancelSelected()} className="rounded-full border border-line bg-surface px-3 py-2 text-sm font-semibold disabled:opacity-50">
              İptal
            </button>
            <button type="button" disabled={busy} onClick={() => void checkInSelected()} className="rounded-full bg-court px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Check-in
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy || !purpose || freeSlots.length === 0}
            onClick={() => void rezerv()}
            className="w-full rounded-full bg-court px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Rezerv
          </button>
        )}
        {actionError ? <p className="mt-1 text-xs text-ink" role="alert">{actionError}</p> : null}
      </div>

      {loading ? <LoadingBlock label="Gün tablosu yükleniyor" /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={onRetry} /> : null}

      {grid && !loading && !error ? (
        <>
          <div className="md:hidden">
            <h1 className="mb-2 text-lg font-semibold">Kortlar</h1>
            <div className="flex flex-wrap gap-1">
              {grid.courts.map((court) => {
                const open = openCourtId === court.id;
                const balloon = court.kind === "BALLOON";
                return (
                  <button
                    key={court.id}
                    type="button"
                    aria-pressed={open}
                    onClick={() => setOpenCourtId(open ? null : court.id)}
                    className={`rounded-lg px-2 py-1 text-sm font-semibold ${balloon ? (open ? "bg-[#1d4ed8] text-white" : "bg-[#60a5fa] text-[#172554]") : (open ? "bg-[#047857] text-white" : "bg-[#34d399] text-[#064e3b]")}`}
                  >
                    {shortCourtLabel(court.name)}
                  </button>
                );
              })}
            </div>
            {openCourt ? (
              <div className="mt-2 grid gap-[2px]">
                {grid.hours.map((hour) => (
                  <div key={hour} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-stretch gap-[2px]">
                    <span className="self-center text-right text-[11px] text-muted">{hour}</span>
                    <SlotButton
                      court={openCourt}
                      hour={hour}
                      cell={cells.get(`${openCourt.id}-${hour}`)}
                      selected={selected.has(cellKey(openCourt.id, hour))}
                      onClick={() => onCell(openCourt, hour)}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-max min-w-full border-separate border-spacing-[2px] text-left">
              <caption className="sr-only">{grid.label} {grid.date}, saatler 08:00–22:00</caption>
              <thead>
                <tr>
                  <th className="w-14" />
                  {grid.courts.map((court) => (
                    <th
                      key={court.id}
                      scope="col"
                      className={`min-w-[5.25rem] border-2 px-1 py-1 text-center text-[11px] font-semibold leading-tight whitespace-nowrap ${headerTone(court.kind === "BALLOON")}`}
                    >
                      <button type="button" className="w-full" onClick={() => toggleCourt(court.id)}>
                        {court.name}
                      </button>
                    </th>
                  ))}
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
    ? `${option?.bg ?? ""} ${option?.text ?? ""} font-semibold ${selected ? "brightness-90" : ""}`
    : selected
      ? "bg-[#16a34a] text-white"
      : "bg-[#e4e2dc] hover:bg-[#22c55e] focus:bg-[#22c55e] focus-visible:bg-[#22c55e] focus-visible:outline-none";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-9 w-full rounded-[3px] px-1 py-1 text-center text-[11px] leading-tight focus-visible:outline-none ${tone}`}
    >
      {option ? option.label : null}
    </button>
  );
}
