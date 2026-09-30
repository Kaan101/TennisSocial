"use client";

import { WEEKDAYS, type CourtPurpose } from "@club/shared";
import { Fragment, useEffect, useState } from "react";
import { type CourtRow, type Person, type Reservation, addHour, shiftDate, weekdayOf } from "@/components/court-ui";
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
  if (!reservation) return { backgroundColor: "#fffdf8", color: "#14241c" };
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
  const [openCourtId, setOpenCourtId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(new Set());
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
  const matchSlots = reservedSlots.filter((item) => item.cell.reservation?.purpose === "MATCH");
  const showMatch = matchSlots.length > 0 && matchSlots.length === reservedSlots.length;
  const days = weekOf(date);

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

  async function applyPurpose(purpose: CourtPurpose) {
    if (freeSlots.length === 0) return;
    setActionError(null);
    try {
      await onApply({ purpose, slots: freeSlots });
      setSelected(new Set());
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı");
    }
  }

  async function clearSelected() {
    const ids = [...new Set(reservedSlots.flatMap((item) => item.cell.reservation ? [item.cell.reservation.id] : []))];
    setActionError(null);
    if (ids.length === 0) {
      setSelected(new Set());
      return;
    }
    try {
      await onCancel(ids);
      setSelected(new Set());
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "İşlem tamamlanamadı");
    }
  }

  async function cancelMatches() {
    const ids = [...new Set(matchSlots.flatMap((item) => item.cell.reservation ? [item.cell.reservation.id] : []))];
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
    const slots = matchSlots.flatMap((item) => item.cell.reservation
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

  const marked = (on: boolean) => (on ? "font-semibold underline underline-offset-2" : "font-normal");

  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <div className="flex w-full min-w-0 items-start gap-2 text-xs md:hidden">
        <button type="button" className="shrink-0 py-1" onClick={() => onDate(shiftDate(date, -7))}>önceki</button>
        <div className="flex min-w-0 flex-1 items-start justify-between gap-1" role="group" aria-label="Haftanın günleri">
          {days.map((day) => {
            const on = day.date === date;
            return (
              <button key={day.date} type="button" aria-pressed={on} aria-label={day.label} onClick={() => onDate(day.date)} className="min-w-0 px-0.5 text-center">
                <span className={`block truncate ${marked(on)}`}>{day.short}</span>
                <span className="block font-normal text-muted">{day.date.slice(8)}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="shrink-0 py-1" onClick={() => onDate(shiftDate(date, 7))}>sonraki</button>
      </div>

      <div className="hidden w-full min-w-0 md:block">
        <div className="flex w-full min-w-0 items-start gap-3 text-sm">
          <button type="button" className="shrink-0 py-1" onClick={() => onDate(shiftDate(date, -7))}>önceki</button>
          <div className="flex min-w-0 flex-1 items-start justify-between gap-2" role="group" aria-label="Haftanın günleri">
            {days.map((day) => {
              const on = day.date === date;
              return (
                <button key={day.date} type="button" aria-pressed={on} onClick={() => onDate(day.date)} className="shrink-0 whitespace-nowrap px-0.5 text-center">
                  <span className={`block ${marked(on)}`}>{day.label}</span>
                  <span className="block text-xs font-normal text-muted">{day.date.slice(8)}</span>
                </button>
              );
            })}
          </div>
          <button type="button" className="shrink-0 py-1" onClick={() => onDate(shiftDate(date, 7))}>sonraki</button>
        </div>
      </div>

      <div className="inline-flex max-w-full flex-wrap items-center justify-start gap-2 md:pl-[4.5rem]" role="group" aria-label="Amaç">
        {PURPOSE_OPTIONS.map((option) => (
          <button
            key={option.purpose}
            type="button"
            disabled={busy}
            onClick={() => void applyPurpose(option.purpose)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink disabled:opacity-50"
          >
            {option.word}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => void clearSelected()}
          className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink disabled:opacity-50"
        >
          Boş
        </button>
        <button
          type="button"
          disabled={busy || !showMatch}
          onClick={() => void cancelMatches()}
          className={`ml-3 rounded-md border border-line px-2 py-1 text-xs text-ink disabled:opacity-40 ${showMatch ? "" : "opacity-40"}`}
          style={{ backgroundColor: "#e7e5e0" }}
        >
          İptal
        </button>
        <button
          type="button"
          disabled={busy || !showMatch}
          onClick={() => void checkInSelected()}
          className={`rounded-md border border-[#86efac] px-2 py-1 text-xs text-ink disabled:opacity-40 ${showMatch ? "" : "opacity-40"}`}
          style={{ backgroundColor: "#d1fae5" }}
        >
          Check-in
        </button>
      </div>
      {actionError ? <p className="text-xs text-ink" role="alert">{actionError}</p> : null}

      {loading ? <LoadingBlock label="Gün tablosu yükleniyor" /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={onRetry} /> : null}

      {grid && !loading && !error ? (
        <>
          <div className="md:hidden">
            <h1 className="mb-2 text-sm font-semibold">Kortlar</h1>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {grid.courts.map((court) => {
                const open = openCourtId === court.id;
                return (
                  <button
                    key={court.id}
                    type="button"
                    aria-pressed={open}
                    onClick={() => setOpenCourtId(open ? null : court.id)}
                    className={open ? "font-semibold underline underline-offset-2" : "font-normal"}
                  >
                    {shortCourtLabel(court.name)}
                  </button>
                );
              })}
            </div>
            {openCourt ? (
              <div className="mt-2 grid gap-1">
                {grid.hours.map((hour) => (
                  <div key={hour} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-stretch gap-1">
                    <span className="py-2 text-xs font-bold text-ink">{hour}</span>
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

          <div className="hidden w-full min-w-0 overflow-x-auto md:block">
            <p className="sr-only">{grid.label} {grid.date}, saatler 08:00–22:00</p>
            <div
              className="grid min-w-[64rem] gap-1"
              style={{ gridTemplateColumns: `4.5rem repeat(${grid.courts.length}, minmax(4.5rem, 1fr))` }}
            >
              <div />
              {grid.courts.map((court) => (
                <div key={court.id} className="px-1 pb-1 text-center text-xs font-semibold">
                  <button type="button" className="w-full font-semibold" onClick={() => toggleCourt(court.id)}>
                    {court.name}
                  </button>
                </div>
              ))}
              {grid.hours.map((hour) => (
                <Fragment key={hour}>
                  <div className="py-2 text-xs font-bold text-ink">{hour}</div>
                  {grid.courts.map((court) => (
                    <SlotButton
                      key={court.id}
                      court={court}
                      hour={hour}
                      cell={cells.get(`${court.id}-${hour}`)}
                      selected={selected.has(cellKey(court.id, hour))}
                      onClick={() => onCell(court, hour)}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
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
  const word = reservation ? purposeWord(reservation.purpose) : "";
  const label = reservation
    ? `${court.name} ${hour} ${word}`
    : `${court.name} ${hour}${selected ? " seçili" : " boş"}`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      disabled={!reservation && !court.active}
      onClick={onClick}
      className={`min-h-9 w-full rounded-md border px-1 py-2 text-center text-[11px] focus-visible:outline-none ${selected ? "border-ink font-semibold underline underline-offset-2" : "border-line"}`}
      style={{ ...cellPaint(reservation), borderRadius: 6 }}
    >
      {word}
    </button>
  );
}
