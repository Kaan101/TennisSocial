"use client";

import { WEEKDAYS, type CourtPurpose } from "@club/shared";
import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react";
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
  TRAINING: "#e5e7eb",
  TOURNAMENT: "#dbeafe",
  MAINTENANCE: "#ffedd5",
};

const CELL_INK: Record<CourtPurpose, string> = {
  MATCH: "#15803d",
  TRAINING: "#374151",
  TOURNAMENT: "#1d4ed8",
  MAINTENANCE: "#c2410c",
};

function purposeOption(purpose: CourtPurpose) {
  return PURPOSE_OPTIONS.find((item) => item.purpose === purpose) ?? PURPOSE_OPTIONS[1]!;
}

export function purposeWord(purpose: CourtPurpose): string {
  return purposeOption(purpose).word;
}

function cellMark(purpose: CourtPurpose): string {
  if (purpose === "MATCH") return "Maç";
  if (purpose === "TRAINING") return "Antr.";
  if (purpose === "MAINTENANCE") return "Bakım";
  return "Turn.";
}

function cellPaint(reservation: DayReservation | null): { backgroundColor: string; color: string; borderColor: string } {
  if (!reservation) return { backgroundColor: "transparent", color: "#14241c", borderColor: "#e0d8c8" };
  if (reservation.purpose === "MATCH" && reservation.checkedIn) return { backgroundColor: "#16a34a", color: "#ffffff", borderColor: "#166534" };
  return { backgroundColor: CELL_FILL[reservation.purpose], color: CELL_INK[reservation.purpose], borderColor: CELL_INK[reservation.purpose] };
}

function cellKey(courtId: string, startTime: string): string {
  return `${courtId}|${startTime}`;
}

function phoneCourtHeader(name: string): string {
  const indoor = /^Kapalı\s*(\d+)$/u.exec(name);
  if (indoor?.[1]) return `Kapalı ${indoor[1]}`;
  const outdoor = /^Kort\s*(\d+)$/u.exec(name);
  if (outdoor?.[1]) return `Kort${outdoor[1]}`;
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

const CourtSlot = memo(function CourtSlot({
  court,
  hour,
  cell,
  picked,
  onPress,
}: {
  court: CourtRow;
  hour: string;
  cell: DayCell | undefined;
  picked: boolean;
  onPress: (court: CourtRow, hour: string) => void;
}) {
  const reservation = cell?.state === "busy" ? cell.reservation : null;
  const word = reservation ? purposeWord(reservation.purpose).toLocaleLowerCase("tr") : "boş";
  return (
    <button
      id={`kort-${court.id}-${hour}`}
      type="button"
      aria-pressed={picked}
      aria-label={`${court.name} ${hour} ${word}`}
      onClick={() => onPress(court, hour)}
      className={`court-press flex min-h-8 w-full min-w-0 items-center justify-center rounded-sm border border-line px-0.5 text-[10px] font-semibold leading-none ${picked ? "ring-2 ring-ink ring-inset" : ""}`}
      style={{ ...cellPaint(reservation), borderRadius: 4 }}
    >
      {reservation ? cellMark(reservation.purpose) : null}
    </button>
  );
});

export function CourtDayGrid({
  date,
  selected,
  onToggleDay,
  grid,
  onApply,
  onCancel,
  onCheckIn,
  focus = null,
}: {
  date: string;
  selected: string[];
  onToggleDay: (date: string) => void;
  grid: DayGrid;
  onApply: (input: { purpose: CourtPurpose; slots: DaySlot[] }) => Promise<void>;
  onCancel: (reservationIds: string[], matchOnly: boolean) => Promise<void>;
  onCheckIn: (slots: { reservationId: string; courtId: string; date: string; startTime: string }[]) => Promise<void>;
  focus?: { date: string; courtId: string; hour: string } | null;
}) {
  const [mode, setMode] = useState<Tool | null>(null);
  const cells = new Map(grid.cells.map((cell) => [`${cell.courtId}-${cell.startTime}`, cell]));
  const days = weekOf(date);
  const shown = grid.date === date;
  const focusHere = focus && focus.date === grid.date ? focus : null;

  useEffect(() => {
    if (!focusHere) return;
    document.getElementById(`kort-${focusHere.courtId}-${focusHere.hour}`)?.scrollIntoView({ block: "center", inline: "center" });
  }, [focusHere]);

  const pressRef = useRef<(court: CourtRow, hour: string) => void>(() => {});
  pressRef.current = (court, hour) => {
    if (!mode || !shown) return;
    const cell = cells.get(`${court.id}-${hour}`);
    const reservation = cell?.state === "busy" ? cell.reservation : null;
    if (mode === "CLEAR") {
      if (!reservation) return;
      void onCancel([reservation.id], false);
      return;
    }
    if (mode === "CANCEL") {
      if (reservation?.purpose !== "MATCH") return;
      void onCancel([reservation.id], true);
      return;
    }
    if (mode === "CHECKIN") {
      if (reservation?.purpose !== "MATCH" || reservation.checkedIn) return;
      void onCheckIn([{ reservationId: reservation.id, courtId: court.id, date: grid.date, startTime: hour }]);
      return;
    }
    if (!court.active || cell?.state === "busy") return;
    void onApply({ purpose: mode, slots: [{ courtId: court.id, startTime: hour }] });
  };
  const onPress = useCallback((court: CourtRow, hour: string) => {
    pressRef.current(court, hour);
  }, []);

  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <h1 className="text-lg font-semibold leading-none">Kortlar</h1>
      <div className="flex w-full min-w-0 items-start justify-between gap-1 text-sm" role="group" aria-label="Haftanın günleri">
        {days.map((day) => {
          const on = selected.includes(day.date);
          return (
            <button key={day.date} type="button" aria-pressed={on} aria-label={day.label} onClick={() => onToggleDay(day.date)} className="min-w-0 flex-1 border-0 bg-transparent px-0.5 py-0 text-center leading-tight text-inherit">
              <span className={`block text-xs font-bold leading-tight md:hidden ${on ? "underline underline-offset-2" : ""}`}>{day.short}</span>
              <span className={`hidden text-sm font-bold leading-tight whitespace-nowrap md:inline ${on ? "underline underline-offset-2" : ""}`}>{day.label}</span>
              <span className="mt-0.5 block text-[10px] font-normal text-muted md:text-xs">{day.date.slice(8)}</span>
            </button>
          );
        })}
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-1 overflow-x-auto px-1 md:flex-nowrap md:gap-2 md:overflow-visible md:px-0" role="group" aria-label="Amaç">
        {PURPOSE_OPTIONS.map((option) => {
          const on = mode === option.purpose;
          return (
            <button
              key={option.purpose}
              type="button"
              aria-pressed={on}
              onClick={() => setMode(option.purpose)}
              className={`court-press shrink-0 rounded-md border px-1 py-1 text-[11px] md:px-2 md:text-xs ${on ? "font-semibold" : ""}`}
              style={{ backgroundColor: CELL_FILL[option.purpose], color: CELL_INK[option.purpose], borderColor: CELL_INK[option.purpose] }}
            >
              {option.word}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={mode === "CLEAR"}
          onClick={() => setMode("CLEAR")}
          className={`court-press shrink-0 rounded-md border bg-surface px-1 py-1 text-[11px] text-ink md:px-2 md:text-xs ${mode === "CLEAR" ? "border-ink font-semibold" : "border-line"}`}
        >
          Boş
        </button>
        <span className="w-3 shrink-0 md:w-4" aria-hidden />
        <button
          type="button"
          aria-pressed={mode === "CANCEL"}
          onClick={() => setMode("CANCEL")}
          className={`court-press shrink-0 rounded-md border px-1 py-1 text-[11px] md:px-2 md:text-xs ${mode === "CANCEL" ? "font-semibold" : ""}`}
          style={{ backgroundColor: "#e7e5e0", color: "#44403c", borderColor: "#44403c" }}
        >
          İptal
        </button>
        <button
          type="button"
          aria-pressed={mode === "CHECKIN"}
          onClick={() => setMode("CHECKIN")}
          className={`court-press shrink-0 rounded-md border px-1 py-1 text-[11px] md:px-2 md:text-xs ${mode === "CHECKIN" ? "font-semibold" : ""}`}
          style={{ backgroundColor: "#d1fae5", color: "#047857", borderColor: "#047857" }}
        >
          Check-in
        </button>
      </div>
      <div className="mt-6 w-full min-w-0 overflow-x-auto">
        <div
          className="grid w-full gap-0.5"
          style={{
            gridTemplateColumns: `3.5rem repeat(${grid.courts.length}, minmax(3.625rem, 1fr))`,
            minWidth: `calc(3.5rem + ${grid.courts.length} * 3.625rem)`,
          }}
        >
          <div />
          {grid.courts.map((court) => (
            <div key={court.id} className="min-w-0 whitespace-normal break-words px-0.5 pb-1 text-center text-[10px] font-semibold leading-tight">
              <span className="md:hidden">{phoneCourtHeader(court.name)}</span>
              <span className="hidden md:inline">{court.name}</span>
            </div>
          ))}
          {grid.hours.map((hour) => (
            <Fragment key={hour}>
              <div className="sticky left-0 z-10 bg-paper py-1 pr-1 text-sm font-normal whitespace-nowrap text-ink lg:static lg:z-auto lg:bg-transparent lg:pr-0">{hour}</div>
              {grid.courts.map((court) => (
                <CourtSlot
                  key={court.id}
                  court={court}
                  hour={hour}
                  cell={cells.get(`${court.id}-${hour}`)}
                  picked={focusHere?.courtId === court.id && focusHere.hour === hour}
                  onPress={onPress}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
