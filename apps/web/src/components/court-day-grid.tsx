"use client";

import { WEEKDAYS, type CourtPurpose } from "@club/shared";
import { Fragment, memo, useEffect, useRef, useState } from "react";
import { type CourtRow, type Person, type Reservation, addHour, fullName, shiftDate, weekdayOf } from "@/components/court-ui";
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
  TRAINING: "#dbeafe",
  MAINTENANCE: "#ffedd5",
  TOURNAMENT: "#f3e8ff",
};

const CELL_INK: Record<CourtPurpose, string> = {
  MATCH: "#15803d",
  TRAINING: "#1d4ed8",
  MAINTENANCE: "#c2410c",
  TOURNAMENT: "#7e22ce",
};

const ACCENT = "#6d28d9";
const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

type Tool = CourtPurpose | "CLEAR" | "CANCEL";
type Picked = { courtId: string; hour: string; date: string };

function purposeOption(purpose: CourtPurpose) {
  return PURPOSE_OPTIONS.find((item) => item.purpose === purpose) ?? PURPOSE_OPTIONS[1]!;
}

export function purposeWord(purpose: CourtPurpose): string {
  return purposeOption(purpose).word;
}

function cellKey(courtId: string, startTime: string): string {
  return `${courtId}|${startTime}`;
}

function longDate(date: string): string {
  const [year, month, day] = date.split("-");
  const name = TR_MONTHS[Number(month) - 1] ?? "";
  const label = WEEKDAYS.find((item) => item.value === weekdayOf(date))?.label ?? "";
  return `${Number(day)} ${name} ${year}, ${label}`;
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

function orderedCourts(courts: CourtRow[]): CourtRow[] {
  return [...courts].sort((a, b) => {
    const group = Number(a.kind !== "BALLOON") - Number(b.kind !== "BALLOON");
    if (group !== 0) return group;
    return a.name.localeCompare(b.name, "tr", { numeric: true, sensitivity: "base" });
  });
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

function findCell(day: DayGrid | null | undefined, courtId: string, hour: string): DayCell | undefined {
  return day?.cells.find((cell) => cell.courtId === courtId && cell.startTime === hour);
}

function cellStyle(reservation: DayReservation | null): { backgroundColor: string; color: string; borderColor: string } {
  if (!reservation) return { backgroundColor: "#ffffff", color: "#14241c", borderColor: "#e5e7eb" };
  return {
    backgroundColor: CELL_FILL[reservation.purpose],
    color: CELL_INK[reservation.purpose],
    borderColor: CELL_INK[reservation.purpose],
  };
}

function canSave(draft: Tool | null, court: CourtRow | undefined, cell: DayCell | undefined): boolean {
  if (!draft || !court) return false;
  const reservation = cell?.state === "busy" ? cell.reservation : null;
  if (draft === "CLEAR") return Boolean(reservation);
  if (draft === "CANCEL") return reservation?.purpose === "MATCH";
  return court.active && cell?.state !== "busy";
}

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
  const word = reservation ? purposeWord(reservation.purpose) : "boş";
  return (
    <button
      id={`kort-${court.id}-${hour}`}
      type="button"
      aria-pressed={picked}
      aria-label={`${court.name} ${hour} ${word}`}
      onClick={() => onPress(court, hour)}
      className={`court-press @container flex min-h-9 w-full min-w-0 items-center justify-center overflow-hidden rounded-lg border px-px text-center leading-tight lg:h-[1.95rem] lg:min-h-[1.95rem] ${picked ? "ring-2 ring-ink ring-inset" : ""}`}
      style={cellStyle(reservation)}
    >
      {reservation ? <span className="whitespace-nowrap font-semibold text-[clamp(8px,18cqi,12px)]">{purposeWord(reservation.purpose)}</span> : null}
    </button>
  );
});

function PurposeChips({
  value,
  onChange,
  labelledBy,
}: {
  value: Tool | null;
  onChange: (tool: Tool) => void;
  labelledBy?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : "Amaç"}>
      {PURPOSE_OPTIONS.map((option) => {
        const on = value === option.purpose;
        return (
          <button
            key={option.purpose}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.purpose)}
            className={`court-press rounded-lg border px-2.5 py-1 text-xs ${on ? "font-semibold ring-2 ring-ink ring-inset" : ""}`}
            style={{ backgroundColor: CELL_FILL[option.purpose], color: CELL_INK[option.purpose], borderColor: CELL_INK[option.purpose] }}
          >
            {option.word}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={value === "CLEAR"}
        onClick={() => onChange("CLEAR")}
        className={`court-press rounded-lg border bg-white px-2.5 py-1 text-xs text-[#4b5563] ${value === "CLEAR" ? "border-ink font-semibold ring-2 ring-ink ring-inset" : "border-[#d1d5db]"}`}
      >
        Boş
      </button>
      <span className="w-3 shrink-0" aria-hidden />
      <button
        type="button"
        aria-pressed={value === "CANCEL"}
        onClick={() => onChange("CANCEL")}
        className={`court-press rounded-lg border bg-white px-2.5 py-1 text-xs text-[#4b5563] ${value === "CANCEL" ? "border-ink font-semibold ring-2 ring-ink ring-inset" : "border-[#d1d5db]"}`}
      >
        İptal
      </button>
    </div>
  );
}

function DateBar({ date, today, onDate }: { date: string; today: string; onDate: (date: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-label="Önceki gün" onClick={() => onDate(shiftDate(date, -1))} className="court-press grid h-8 w-8 place-items-center rounded-full border border-[#d1d5db] text-sm">‹</button>
      <p className="min-w-0 flex-1 text-center text-sm font-semibold">{longDate(date)}</p>
      <button type="button" aria-label="Sonraki gün" onClick={() => onDate(shiftDate(date, 1))} className="court-press grid h-8 w-8 place-items-center rounded-full border border-[#d1d5db] text-sm">›</button>
      <button type="button" onClick={() => onDate(today)} aria-pressed={date === today} className="court-press rounded-full border border-[#d1d5db] px-3 py-1 text-sm font-semibold">Bugün</button>
    </div>
  );
}

function ReservationRow({ reservation, start, end }: { reservation: DayReservation; start: string; end: string }) {
  const players = reservation.players ?? [];
  return (
    <article
      className="rounded-xl border px-3 py-2 text-sm"
      style={{ backgroundColor: CELL_FILL[reservation.purpose], color: CELL_INK[reservation.purpose], borderColor: CELL_INK[reservation.purpose] }}
    >
      <p className="font-semibold">{purposeWord(reservation.purpose)}</p>
      <p className="text-xs">{start}–{end}</p>
      <p className="text-xs">{reservation.statusLabel}</p>
      {players.length > 0 ? <p className="text-xs">{players.map((person) => fullName(person)).join(", ")}</p> : null}
    </article>
  );
}

export function CourtDayGrid({
  date,
  today,
  week,
  grid,
  onDate,
  onApply,
  onCancel,
  focus = null,
  failed = false,
  onRetry,
}: {
  date: string;
  today: string;
  week: DayGrid[];
  grid: DayGrid;
  onDate: (date: string) => void;
  onApply: (input: { purpose: CourtPurpose; slots: DaySlot[]; date: string }) => Promise<void>;
  onCancel: (reservationIds: string[], matchOnly: boolean, date: string) => Promise<void>;
  focus?: { date: string; courtId: string; hour: string } | null;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const [mode, setMode] = useState<Tool | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [draft, setDraft] = useState<Tool | null>(null);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<"reservation" | "details">("reservation");
  const appliedFocus = useRef("");
  const scrolledFocus = useRef("");
  const days = new Map(week.map((day) => [day.date, day]));
  if (grid.date === date) days.set(grid.date, grid);
  const active = days.get(date) ?? null;
  const courts = orderedCourts(active?.courts ?? week[0]?.courts ?? []);
  const hours = active?.hours ?? week[0]?.hours ?? [];
  const focusHere = focus && focus.date === date ? focus : null;
  const focusKey = focusHere ? `${focusHere.date}|${focusHere.courtId}|${focusHere.hour}` : "";

  useEffect(() => {
    if (!focusHere || appliedFocus.current === focusKey) return;
    const day = week.find((item) => item.date === focusHere.date) ?? (grid.date === focusHere.date ? grid : null);
    if (!day) return;
    const cell = findCell(day, focusHere.courtId, focusHere.hour);
    appliedFocus.current = focusKey;
    setPicked({ courtId: focusHere.courtId, hour: focusHere.hour, date: focusHere.date });
    setDraft(cell?.state === "busy" && cell.reservation ? cell.reservation.purpose : null);
    setPanel("reservation");
  }, [focusHere, focusKey, week, grid]);

  useEffect(() => {
    if (!focusHere || scrolledFocus.current === focusKey) return;
    const node = document.getElementById(`kort-${focusHere.courtId}-${focusHere.hour}`);
    if (!node) return;
    scrolledFocus.current = focusKey;
    node.scrollIntoView({ block: "center", inline: "center" });
  }, [focusHere, focusKey, active]);

  function dayFor(dayDate: string): DayGrid | null {
    return days.get(dayDate) ?? null;
  }

  function choose(next: Picked, nextDraft: Tool | null) {
    setPicked(next);
    setDraft(nextDraft);
    setPanel("reservation");
  }

  function draftFromCell(cell: DayCell | undefined): Tool | null {
    return cell?.state === "busy" && cell.reservation ? cell.reservation.purpose : null;
  }

  function resultingDraft(before: DayCell | undefined, court: CourtRow): Tool | null {
    const reservation = before?.state === "busy" ? before.reservation : null;
    if (mode === "CLEAR") return reservation ? null : draftFromCell(before);
    if (mode === "CANCEL") return reservation?.purpose === "MATCH" ? null : draftFromCell(before);
    if (mode && court.active && before?.state !== "busy") return mode;
    return draftFromCell(before);
  }

  function moveDay(next: string) {
    onDate(next);
    if (!picked) return;
    const nextPick = { ...picked, date: next };
    choose(nextPick, draftFromCell(findCell(dayFor(next), nextPick.courtId, nextPick.hour)));
  }

  function paint(court: CourtRow, hour: string, day: DayGrid) {
    if (!mode) return;
    const cell = findCell(day, court.id, hour);
    const reservation = cell?.state === "busy" ? cell.reservation : null;
    if (mode === "CLEAR") {
      if (!reservation) return;
      void onCancel([reservation.id], false, day.date);
      return;
    }
    if (mode === "CANCEL") {
      if (reservation?.purpose !== "MATCH") return;
      void onCancel([reservation.id], true, day.date);
      return;
    }
    if (!court.active || cell?.state === "busy") return;
    void onApply({ purpose: mode, slots: [{ courtId: court.id, startTime: hour }], date: day.date });
  }

  function pressDay(court: CourtRow, hour: string) {
    if (!active) return;
    const before = findCell(active, court.id, hour);
    paint(court, hour, active);
    choose({ courtId: court.id, hour, date: active.date }, resultingDraft(before, court));
  }

  const pickedDay = picked ? dayFor(picked.date) : null;
  const pickedCourt = picked ? courts.find((court) => court.id === picked.courtId) ?? pickedDay?.courts.find((court) => court.id === picked.courtId) : undefined;
  const pickedCell = pickedDay && picked ? findCell(pickedDay, picked.courtId, picked.hour) : undefined;
  const pickedReservation = pickedCell?.state === "busy" ? pickedCell.reservation : null;

  async function save() {
    if (!picked || !pickedCourt || !pickedDay || !canSave(draft, pickedCourt, pickedCell)) return;
    setSaving(true);
    try {
      if (draft === "CLEAR") {
        if (pickedReservation) await onCancel([pickedReservation.id], false, pickedDay.date);
        return;
      }
      if (draft === "CANCEL") {
        if (pickedReservation?.purpose === "MATCH") await onCancel([pickedReservation.id], true, pickedDay.date);
        return;
      }
      if (!draft) return;
      await onApply({ purpose: draft, slots: [{ courtId: pickedCourt.id, startTime: picked.hour }], date: pickedDay.date });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 lg:ml-[calc(50%-45vw)] lg:w-[90vw]">
      <h1 className="text-2xl font-semibold tracking-tight">Kortlar</h1>
      <DateBar date={date} today={today} onDate={moveDay} />
      <PurposeChips value={mode} onChange={setMode} />
      <div className="flex w-full min-w-0 flex-col gap-4 lg:flex-row lg:flex-nowrap lg:items-start">
        <div className="min-w-0 flex-1">
          {failed && !active ? <ErrorState message="Gün tablosu yüklenemedi" onRetry={onRetry} /> : null}
          {!failed && !active ? <LoadingBlock label="Gün yükleniyor" /> : null}
          {active && courts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line bg-surface px-5 py-8 text-center">
              <p className="font-semibold">Bu kulüpte kort yok</p>
            </div>
          ) : null}
          {active && courts.length > 0 ? (
            <DayTable courts={courts} hours={hours} day={active} picked={picked} onPress={pressDay} />
          ) : null}
        </div>
        <SlotPanel
          date={picked?.date ?? date}
          hour={picked?.hour}
          court={pickedCourt}
          cell={pickedCell}
          reservation={pickedReservation}
          draft={draft}
          panel={panel}
          saving={saving}
          onPanel={setPanel}
          onDraft={setDraft}
          onSave={() => void save()}
        />
      </div>
    </div>
  );
}

function DayTable({
  courts,
  hours,
  day,
  picked,
  onPress,
}: {
  courts: CourtRow[];
  hours: string[];
  day: DayGrid;
  picked: Picked | null;
  onPress: (court: CourtRow, hour: string) => void;
}) {
  const cells = new Map(day.cells.map((cell) => [`${cell.courtId}-${cell.startTime}`, cell]));
  const dayMin = `calc(3rem + ${courts.length} * 5.25rem)`;
  return (
    <div className="w-full min-w-0 overflow-x-auto lg:overflow-x-visible">
      <div
        className="grid w-full min-w-[var(--day-min)] gap-x-1 gap-y-1 lg:min-w-0 lg:gap-y-0.5"
        style={{
          gridTemplateColumns: `3rem repeat(${courts.length}, minmax(0, 1fr))`,
          ["--day-min" as string]: dayMin,
        }}
      >
        <div className="sticky left-0 z-10 bg-paper pr-1 text-[11px] font-semibold text-[#6b7280]">Saat</div>
        {courts.map((court) => (
          <div key={court.id} className="min-w-0 px-0.5 pb-1 text-center text-[10px] font-semibold leading-tight break-words">{court.name}</div>
        ))}
        {hours.map((hour) => (
          <Fragment key={hour}>
            <div className="sticky left-0 z-10 flex items-center bg-paper pr-1 text-[11px] text-[#6b7280]">{hour}</div>
            {courts.map((court) => (
              <CourtSlot
                key={court.id}
                court={court}
                hour={hour}
                cell={cells.get(`${court.id}-${hour}`)}
                picked={picked?.date === day.date && picked.courtId === court.id && picked.hour === hour}
                onPress={onPress}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function SlotPanel({
  date,
  hour,
  court,
  cell,
  reservation,
  draft,
  panel,
  saving,
  onPanel,
  onDraft,
  onSave,
}: {
  date: string;
  hour?: string;
  court?: CourtRow;
  cell: DayCell | undefined;
  reservation: DayReservation | null;
  draft: Tool | null;
  panel: "reservation" | "details";
  saving: boolean;
  onPanel: (panel: "reservation" | "details") => void;
  onDraft: (tool: Tool) => void;
  onSave: () => void;
}) {
  const start = cell?.startTime ?? hour;
  const end = start ? cell?.endTime ?? addHour(start) : undefined;
  const enabled = canSave(draft, court, cell) && !saving;
  return (
    <aside className="w-full shrink-0 self-start rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm lg:sticky lg:top-2 lg:w-80" aria-label="Seçilen saat">
      <p className="text-sm font-semibold">{longDate(date)}</p>
      {start && end ? <p className="mt-1 text-sm text-[#4b5563]">{start}–{end}</p> : <p className="mt-1 text-sm text-[#6b7280]">Bir saat seçin</p>}
      {court ? <p className="mt-1 text-sm font-semibold">{court.name}</p> : null}
      <div className="mt-3 flex gap-4 border-b border-[#e5e7eb]" role="tablist" aria-label="Saat paneli">
        {([
          ["reservation", "Rezervasyon"],
          ["details", "Detaylar"],
        ] as const).map(([id, label]) => {
          const on = panel === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onPanel(id)}
              className={`-mb-px border-b-2 pb-2 text-sm ${on ? "font-semibold" : "border-transparent text-[#6b7280]"}`}
              style={on ? { borderColor: ACCENT, color: ACCENT } : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>
      {panel === "reservation" ? (
        <div className="mt-3 space-y-3">
          <PurposeChips value={draft} onChange={onDraft} />
          <button
            type="button"
            onClick={onSave}
            disabled={!enabled}
            className="court-press rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: ACCENT }}
          >
            Kaydet
          </button>
          {reservation && start && end ? <ReservationRow reservation={reservation} start={start} end={end} /> : null}
        </div>
      ) : court ? (
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-xs text-[#6b7280]">Ad</dt>
            <dd className="font-semibold">{court.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6b7280]">Tür</dt>
            <dd>{court.kindLabel}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6b7280]">Durum</dt>
            <dd>{court.active ? "aktif" : "pasif"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6b7280]">Sıra</dt>
            <dd>{court.sortOrder}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-[#6b7280]">Bir saat seçin</p>
      )}
    </aside>
  );
}
