"use client";

import type { AvailabilityState } from "@club/shared";
import { istanbulNowParts } from "@club/shared";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { ErrorState, LoadingBlock } from "@/components/states";
import { api } from "@/lib/api";

type Manual = AvailabilityState | null;
type Tool = AvailabilityState | "CLEAR";

type Cell = {
  date: string;
  startTime: string;
  manual: Manual;
};

type WeekGrid = {
  weekStart: string;
  hours: string[];
  days: { date: string; weekday: number; label: string; short: string }[];
  cells: Cell[];
};

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function weekRange(start: string, end: string): string {
  const [startYear, startMonth, startDay] = start.split("-");
  const [endYear, endMonth, endDay] = end.split("-");
  const startName = TR_MONTHS[Number(startMonth) - 1] ?? "";
  const endName = TR_MONTHS[Number(endMonth) - 1] ?? "";
  const startNum = Number(startDay);
  const endNum = Number(endDay);
  if (!startName || !endName) return "";
  if (startYear === endYear && startMonth === endMonth) return `${startNum}–${endNum} ${startName} ${startYear}`;
  if (startYear === endYear) return `${startNum} ${startName} – ${endNum} ${endName} ${startYear}`;
  return `${startNum} ${startName} ${startYear} – ${endNum} ${endName} ${endYear}`;
}

const MODES: { state: AvailabilityState; word: string; backgroundColor: string; color: string }[] = [
  { state: "FULL", word: "Tam", backgroundColor: "#16a34a", color: "#ffffff" },
  { state: "MAYBE", word: "Belki", backgroundColor: "#bbf7d0", color: "#14241c" },
  { state: "BUSY", word: "Dolu", backgroundColor: "#fecaca", color: "#14241c" },
];

function paintCell(grid: WeekGrid, date: string, startTime: string, manual: Manual): WeekGrid {
  return {
    ...grid,
    cells: grid.cells.map((cell) => (cell.date === date && cell.startTime === startTime ? { ...cell, manual } : cell)),
  };
}

function cellFill(cell: Cell): { backgroundColor: string; color: string } {
  if (cell.manual === "FULL") return { backgroundColor: "#16a34a", color: "#ffffff" };
  if (cell.manual === "MAYBE") return { backgroundColor: "#bbf7d0", color: "#14241c" };
  if (cell.manual === "BUSY") return { backgroundColor: "#fecaca", color: "#14241c" };
  return { backgroundColor: "transparent", color: "#14241c" };
}

function cellWord(cell: Cell): string {
  if (cell.manual === "FULL") return "tam";
  if (cell.manual === "MAYBE") return "belki";
  if (cell.manual === "BUSY") return "dolu";
  return "boş";
}

const StampCell = memo(function StampCell({
  label,
  date,
  hour,
  cell,
  onPress,
}: {
  label: string;
  date: string;
  hour: string;
  cell: Cell | undefined;
  onPress: (date: string, hour: string) => void;
}) {
  const word = cell ? cellWord(cell) : "boş";
  return (
    <button
      type="button"
      aria-label={`${label} ${hour} ${word}`}
      onClick={() => onPress(date, hour)}
      className="court-press block h-full min-h-0 w-full border border-[#d1d5db] lg:min-h-8"
      style={cell ? { ...cellFill(cell), borderRadius: 4 } : { backgroundColor: "transparent", borderRadius: 4 }}
    />
  );
});

function useCurrentDay(): string {
  const [day, setDay] = useState(() => istanbulNowParts().day);
  useEffect(() => {
    const sync = () => {
      const next = istanbulNowParts().day;
      setDay((current) => (current === next ? current : next));
    };
    document.addEventListener("visibilitychange", sync);
    const timer = window.setInterval(sync, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.clearInterval(timer);
    };
  }, []);
  return day;
}

export default function AvailabilityCalendarPage() {
  const today = useCurrentDay();
  const [grid, setGrid] = useState<WeekGrid | null>(null);
  const [mode, setMode] = useState<Tool | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const gridRef = useRef(grid);
  const paintEpoch = useRef(0);
  const todayRef = useRef(today);

  useEffect(() => {
    todayRef.current = today;
    const epoch = paintEpoch.current;
    const requested = today;
    let cancel = false;
    api<WeekGrid>(`/me/availability-week?week=${requested}`, { cache: "no-store" })
      .then((data) => {
        if (cancel || todayRef.current !== requested) return;
        const sameWeek = gridRef.current?.weekStart === data.weekStart;
        if (sameWeek && paintEpoch.current !== epoch) return;
        gridRef.current = data;
        setGrid(data);
        setFailed(false);
      })
      .catch(() => {
        if (cancel || todayRef.current !== requested || gridRef.current) return;
        setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, [today, retry]);

  function showGrid(next: WeekGrid) {
    gridRef.current = next;
    flushSync(() => setGrid(next));
  }

  const marks = useMemo(() => {
    const map = new Map<string, Cell>();
    for (const cell of grid?.cells ?? []) map.set(`${cell.date}|${cell.startTime}`, cell);
    return map;
  }, [grid]);

  const onCellRef = useRef<(date: string, startTime: string) => void>(() => {});
  const onPress = useCallback((date: string, hour: string) => {
    onCellRef.current(date, hour);
  }, []);

  function onCell(date: string, startTime: string) {
    if (!mode) return;
    const snapshot = gridRef.current;
    const cell = snapshot?.cells.find((item) => item.date === date && item.startTime === startTime);
    const next = mode === "CLEAR" ? null : mode;
    if (!snapshot || !cell || cell.manual === next) return;
    const previous = cell.manual;
    paintEpoch.current += 1;
    showGrid(paintCell(snapshot, date, startTime, next));
    void api("/me/availability-cells", {
      method: "POST",
      body: JSON.stringify({ date, startTime, state: next }),
    }).catch(() => {
      const current = gridRef.current;
      if (!current || current.weekStart !== snapshot.weekStart) return;
      const restored = paintCell(current, date, startTime, previous);
      gridRef.current = restored;
      setGrid(restored);
    });
  }
  onCellRef.current = onCell;

  if (!grid && !failed) return <LoadingBlock label="Müsaitlik yükleniyor" />;
  if (!grid && failed) return <ErrorState message="Müsaitlik yüklenemedi" onRetry={() => setRetry((value) => value + 1)} />;

  if (!grid) return null;

  return (
    <div className="-mx-4 flex h-[calc(100dvh-13.25rem)] w-[calc(100%+2rem)] min-w-0 flex-col gap-1 overflow-hidden lg:mx-0 lg:h-auto lg:w-full lg:gap-2 lg:overflow-visible">
      <style>{`
        .musait-board { grid-template-columns: 3.5rem repeat(7, minmax(0, 1fr)); }
        @media (max-width: 63.99rem) {
          .musait-board { grid-template-rows: auto repeat(var(--musait-rows), minmax(0, 1fr)); }
        }
        @media (min-width: 64rem) {
          .musait-board { grid-template-columns: 3.75rem repeat(7, minmax(7.25rem, 1fr)); }
        }
      `}</style>
      <div className="flex shrink-0 items-baseline justify-between gap-3 px-4 lg:px-0">
        <h1 className="shrink-0 text-lg font-semibold leading-none">Müsaitlik</h1>
        <p className="min-w-0 text-right text-sm leading-tight text-muted">{weekRange(grid.days[0]?.date ?? "", grid.days[6]?.date ?? "")}</p>
      </div>
      <div className="mb-3 flex w-full max-w-full shrink-0 flex-wrap items-center justify-center gap-2 px-4 lg:px-0" role="group" aria-label="Müsaitlik">
        {MODES.map((option) => {
          const on = mode === option.state;
          return (
            <button
              key={option.state}
              type="button"
              aria-pressed={on}
              onClick={() => setMode(option.state)}
              className={`court-press rounded-md border px-2 py-1 text-xs ${on ? "border-ink font-semibold" : "border-line"}`}
              style={{ backgroundColor: option.backgroundColor, color: option.color }}
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
      </div>
      <div className="min-h-0 w-full flex-1 lg:flex-none lg:overflow-x-auto">
        <div
          className="musait-board grid h-full w-full min-w-full gap-x-1 gap-y-0.5 lg:h-auto lg:min-w-max lg:gap-1"
          style={{ "--musait-rows": String(grid.hours.length) } as CSSProperties}
        >
          <div />
          {grid.days.map((day) => (
            <div key={day.date} className="flex min-h-0 min-w-0 flex-col items-center justify-end pb-px text-center">
              <span className="text-xs font-semibold leading-none lg:hidden">{day.short}</span>
              <span className="hidden max-w-full truncate text-sm font-semibold leading-none lg:block">{day.label}</span>
              <span className="mt-px hidden text-[9px] font-normal leading-none text-muted lg:block">{day.date.slice(8)}</span>
            </div>
          ))}
          {grid.hours.map((hour) => (
            <Fragment key={hour}>
              <div className="flex items-center pl-0.5 whitespace-nowrap text-sm font-bold leading-none text-ink lg:py-1 lg:pl-0">{hour}</div>
              {grid.days.map((day) => (
                <StampCell
                  key={day.date}
                  label={day.label}
                  date={day.date}
                  hour={hour}
                  cell={marks.get(`${day.date}|${hour}`)}
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
