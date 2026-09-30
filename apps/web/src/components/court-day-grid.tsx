"use client";

import { WEEKDAYS, type CourtPurpose } from "@club/shared";
import { Fragment, useState } from "react";
import { type CourtRow, type Person, type Reservation, addHour, shiftDate, weekdayOf } from "@/components/court-ui";

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

const PURPOSE_OPTIONS: { purpose: CourtPurpose; word: string }[] = [
  { purpose: "MATCH", word: "Maç" },
  { purpose: "TRAINING", word: "Antrenman" },
  { purpose: "MAINTENANCE", word: "Bakım" },
  { purpose: "TOURNAMENT", word: "Turnuva" },
];

const CELL_FILL: Record<CourtPurpose, string> = {
  MATCH: "#dcfce7",
  TRAINING: "#f3e8ff",
  TOURNAMENT: "#dbeafe",
  MAINTENANCE: "#ffedd5",
};

function purposeOption(purpose: CourtPurpose) {
  return PURPOSE_OPTIONS.find((item) => item.purpose === purpose) ?? PURPOSE_OPTIONS[1]!;
}

export function purposeWord(purpose: CourtPurpose): string {
  return purposeOption(purpose).word;
}

function cellPaint(reservation: DayReservation | null): { backgroundColor: string; color: string } {
  if (!reservation) return { backgroundColor: "transparent", color: "#14241c" };
  if (reservation.purpose === "MATCH" && reservation.checkedIn) return { backgroundColor: "#16a34a", color: "#ffffff" };
  return { backgroundColor: CELL_FILL[reservation.purpose], color: "#14241c" };
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

function weekOf(date: string): { date: string; short: string; label: string }[] {
  const weekday = weekdayOf(date);
  const monday = shiftDate(date, weekday === 0 ? -6 : 1 - weekday);
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftDate(monday, index);
    const known = WEEKDAYS.find((item) => item.value === weekdayOf(day));
    return { date: day, short: known?.short ?? "", label: known?.label ?? "" };
  });
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

export function paintPurpose(grid: DayGrid, slots: DaySlot[], purpose: CourtPurpose, status: "PENDING" | "APPROVED"): DayGrid {
  const keys = new Set(slots.map((slot) => cellKey(slot.courtId, slot.startTime)));
  return {
    ...grid,
    cells: grid.cells.map((cell) => {
      if (!keys.has(cellKey(cell.courtId, cell.startTime)) || cell.state === "busy") return cell;
      return {
        ...cell,
        state: "busy",
        reservation: {
          id: `local-${cell.courtId}-${cell.startTime}`,
          status,
          statusLabel: status === "APPROVED" ? "onaylı" : "beklemede",
          purpose,
          purposeLabel: purposeWord(purpose),
          checkedIn: false,
          canCheckIn: false,
          checkInHint: null,
          players: [],
        },
      };
    }),
  };
}

export function paintCheckedIn(grid: DayGrid, slots: { courtId?: string; startTime: string; reservationId: string }[]): DayGrid {
  const keys = new Set(slots.map((slot) => `${slot.reservationId}|${slot.startTime}`));
  return {
    ...grid,
    cells: grid.cells.map((cell) => {
      if (!cell.reservation || !keys.has(`${cell.reservation.id}|${cell.startTime}`)) return cell;
      return { ...cell, reservation: { ...cell.reservation, checkedIn: true, canCheckIn: false } };
    }),
  };
}

export function restoreSlots(current: DayGrid, snapshot: DayGrid, slots: DaySlot[]): DayGrid {
  const keys = new Set(slots.map((slot) => cellKey(slot.courtId, slot.startTime)));
  const previous = new Map(snapshot.cells.map((cell) => [cellKey(cell.courtId, cell.startTime), cell]));
  return {
    ...current,
    cells: current.cells.map((cell) => (keys.has(cellKey(cell.courtId, cell.startTime)) ? previous.get(cellKey(cell.courtId, cell.startTime)) ?? cell : cell)),
  };
}

export function clearReservations(grid: DayGrid, ids: string[]): DayGrid {
  const drop = new Set(ids);
  return {
    ...grid,
    cells: grid.cells.map((cell) => {
      if (!cell.reservation || !drop.has(cell.reservation.id)) return cell;
      return { ...cell, state: "free", reservation: null };
    }),
  };
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

type Tool = CourtPurpose | "CLEAR" | "CANCEL" | "CHECKIN";

export function CourtDayGrid({
  date,
  onDate,
  grid,
  onApply,
  onCancel,
  onCheckIn,
}: {
  date: string;
  onDate: (date: string) => void;
  grid: DayGrid;
  onApply: (input: { purpose: CourtPurpose; slots: DaySlot[] }) => Promise<void>;
  onCancel: (reservationIds: string[]) => Promise<void>;
  onCheckIn: (slots: { reservationId: string; courtId: string; date: string; startTime: string }[]) => Promise<void>;
}) {
  const [mode, setMode] = useState<Tool | null>(null);
  const cells = new Map(grid.cells.map((cell) => [`${cell.courtId}-${cell.startTime}`, cell]));
  const days = weekOf(date);
  const shown = grid.date === date;

  function onCell(court: CourtRow, hour: string) {
    if (!mode || !shown) return;
    const cell = cells.get(`${court.id}-${hour}`);
    const reservation = cell?.state === "busy" ? cell.reservation : null;
    if (mode === "CLEAR") {
      if (!reservation) return;
      void onCancel([reservation.id]);
      return;
    }
    if (mode === "CANCEL") {
      if (reservation?.purpose !== "MATCH") return;
      void onCancel([reservation.id]);
      return;
    }
    if (mode === "CHECKIN") {
      if (reservation?.purpose !== "MATCH" || reservation.checkedIn) return;
      void onCheckIn([{ reservationId: reservation.id, courtId: court.id, date: grid.date, startTime: hour }]);
      return;
    }
    if (!court.active || cell?.state === "busy") return;
    void onApply({ purpose: mode, slots: [{ courtId: court.id, startTime: hour }] });
  }

  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <h1 className="text-sm font-semibold">Kortlar</h1>
      <div className="flex w-full min-w-0 items-center gap-2 text-sm md:gap-3">
        <button type="button" className="court-press shrink-0 py-1" onClick={() => onDate(shiftDate(date, -7))}>önceki</button>
        <div className="flex min-w-0 flex-1 items-start justify-between gap-1" role="group" aria-label="Haftanın günleri">
          {days.map((day) => {
            const on = day.date === date;
            return (
              <button key={day.date} type="button" aria-pressed={on} aria-label={day.label} onClick={() => onDate(day.date)} className="court-press min-w-0 px-0.5 text-center text-[10px] leading-tight md:text-xs">
                <span className={`md:hidden ${on ? "font-semibold underline underline-offset-2" : "font-normal"}`}>{day.short}</span>
                <span className={`hidden whitespace-nowrap md:inline ${on ? "font-semibold underline underline-offset-2" : "font-normal"}`}>{day.label}</span>
                <span className="mt-0.5 block font-normal text-muted">{day.date.slice(8)}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="court-press shrink-0 py-1" onClick={() => onDate(shiftDate(date, 7))}>sonraki</button>
      </div>
      <div className="inline-flex max-w-full flex-wrap items-center justify-start gap-2 md:pl-[3.25rem]" role="group" aria-label="Amaç">
        {PURPOSE_OPTIONS.map((option) => {
          const on = mode === option.purpose;
          return (
            <button
              key={option.purpose}
              type="button"
              aria-pressed={on}
              onClick={() => setMode(option.purpose)}
              className={`court-press rounded-md border px-2 py-1 text-xs ${on ? "border-ink font-semibold" : "border-line"}`}
              style={{ backgroundColor: CELL_FILL[option.purpose], color: "#14241c" }}
            >
              {option.word}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={mode === "CLEAR"}
          onClick={() => setMode("CLEAR")}
          className={`court-press rounded-md border bg-surface px-2 py-1 text-xs text-ink ${mode === "CLEAR" ? "border-ink font-semibold" : "border-line"}`}
        >
          Boş
        </button>
        <button
          type="button"
          aria-pressed={mode === "CANCEL"}
          onClick={() => setMode("CANCEL")}
          className={`court-press rounded-md border px-2 py-1 text-xs text-ink ${mode === "CANCEL" ? "border-ink font-semibold" : "border-line"}`}
          style={{ backgroundColor: "#e7e5e0" }}
        >
          İptal
        </button>
        <button
          type="button"
          aria-pressed={mode === "CHECKIN"}
          onClick={() => setMode("CHECKIN")}
          className={`court-press rounded-md border px-2 py-1 text-xs text-ink ${mode === "CHECKIN" ? "border-ink font-semibold" : "border-[#86efac]"}`}
          style={{ backgroundColor: "#d1fae5" }}
        >
          Check-in
        </button>
      </div>
      <div className="w-full min-w-0 overflow-x-auto">
        <div
          className="grid w-max gap-0.5"
          style={{ gridTemplateColumns: `3.25rem repeat(${grid.courts.length}, 7.25rem)` }}
        >
          <div />
          {grid.courts.map((court) => (
            <div key={court.id} className="whitespace-nowrap px-1 pb-1 text-center text-[10px] font-semibold leading-tight md:text-xs">
              <span className="md:hidden">{shortCourtLabel(court.name)}</span>
              <span className="hidden md:inline">{court.name}</span>
            </div>
          ))}
          {grid.hours.map((hour) => (
            <Fragment key={hour}>
              <div className="py-1 text-[10px] font-bold text-ink">{hour}</div>
              {grid.courts.map((court) => {
                const cell = cells.get(`${court.id}-${hour}`);
                const reservation = cell?.state === "busy" ? cell.reservation : null;
                const word = reservation ? purposeWord(reservation.purpose).toLocaleLowerCase("tr") : "boş";
                return (
                  <button
                    key={court.id}
                    type="button"
                    aria-label={`${court.name} ${hour} ${word}`}
                    onClick={() => onCell(court, hour)}
                    className="court-press block min-h-8 w-full rounded-sm border border-line"
                    style={{ ...cellPaint(reservation), borderRadius: 4 }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
