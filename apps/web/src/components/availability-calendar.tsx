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

const STAMP: Record<Exclude<Manual, null>, { word: string; backgroundColor: string; color: string; borderColor: string }> = {
  FULL: { word: "Tam", backgroundColor: "lawngreen", color: "green", borderColor: "forestgreen" },
  MAYBE: { word: "Belki", backgroundColor: "aquamarine", color: "green", borderColor: "green" },
  BUSY: { word: "Dolu", backgroundColor: "bisque", color: "red", borderColor: "red" },
};

const MODES = (Object.keys(STAMP) as Exclude<Manual, null>[]).map((state) => ({ state, ...STAMP[state] }));

function paintCell(grid: WeekGrid, date: string, startTime: string, manual: Manual): WeekGrid {
  return {
    ...grid,
    cells: grid.cells.map((cell) => (cell.date === date && cell.startTime === startTime ? { ...cell, manual } : cell)),
  };
}

function cellFill(cell: Cell): { backgroundColor: string; color: string; borderColor: string } {
  if (cell.manual) return STAMP[cell.manual];
  return { backgroundColor: "transparent", color: "#14241c", borderColor: "#d1d5db" };
}

function cellWord(cell: Cell): string {
  if (cell.manual) return STAMP[cell.manual].word;
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
  const paint = cell ? cellFill(cell) : { backgroundColor: "transparent", color: "#14241c", borderColor: "#d1d5db" };
  return (
    <button
      type="button"
      aria-label={`${label} ${hour} ${word}`}
      onClick={() => onPress(date, hour)}
      className="court-press flex h-full min-h-0 w-full items-center justify-center border px-0.5 text-[10px] font-normal leading-none lg:min-h-8 lg:text-xs"
      style={{ backgroundColor: paint.backgroundColor, color: paint.color, borderColor: paint.borderColor, borderRadius: 4 }}
    >
      {cell?.manual ? STAMP[cell.manual].word : null}
    </button>
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

export function AvailabilityCalendar({
  heading = true,
  flow = false,
  shortDays = false,
}: {
  heading?: boolean;
  flow?: boolean;
  shortDays?: boolean;
}) {
  const today = useCurrentDay();
  const [grid, setGrid] = useState<WeekGrid | null>(null);
  const [mode, setMode] = useState<Tool | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const gridRef = useRef(grid);
  const paintEpoch = useRef(0);
  const cellToken = useRef(new Map<string, number>());
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
    const key = `${date}|${startTime}`;
    const token = (cellToken.current.get(key) ?? 0) + 1;
    cellToken.current.set(key, token);
    paintEpoch.current += 1;
    setNotice(null);
    void api("/me/availability-cells", {
      method: "POST",
      body: JSON.stringify({ date, startTime, state: next }),
    }).then(() => {
      if (cellToken.current.get(key) !== token) return;
      const current = gridRef.current;
      if (!current || current.weekStart !== snapshot.weekStart) return;
      paintEpoch.current += 1;
      showGrid(paintCell(current, date, startTime, next));
      setNotice(null);
    }).catch(() => {
      if (cellToken.current.get(key) !== token) return;
      setNotice("Müsaitlik kaydedilemedi.");
    });
  }
  onCellRef.current = onCell;

  if (!grid && !failed) return <LoadingBlock label="Müsaitlik yükleniyor" />;
  if (!grid && failed) return <ErrorState message="Müsaitlik yüklenemedi" onRetry={() => setRetry((value) => value + 1)} />;

  if (!grid) return null;

  return (
    <div className={flow ? "flex w-full min-w-0 flex-col gap-1 rounded-xl border border-[#d1d5db] p-2 lg:gap-2" : "-mx-4 flex h-[calc(100dvh-13.25rem)] w-[calc(100%+2rem)] min-w-0 flex-col gap-1 overflow-hidden lg:mx-0 lg:h-auto lg:w-full lg:gap-2 lg:overflow-visible"}>
      <style>{`
        .musait-board { grid-template-columns: 3.5rem repeat(7, minmax(0, 1fr)); }
        @media (max-width: 63.99rem) {
          .musait-board { grid-template-rows: auto repeat(var(--musait-rows), ${flow ? "1.6rem" : "minmax(0, 1fr)"}); }
        }
        @media (min-width: 64rem) {
          .musait-board { grid-template-columns: 3.75rem repeat(7, minmax(0, 1fr)); }
        }
        .musait-board-short { grid-template-columns: 3.5rem repeat(7, minmax(2.25rem, 1fr)); }
        @media (min-width: 64rem) {
          .musait-board-short { grid-template-columns: 3.75rem repeat(7, minmax(2.25rem, 1fr)); }
        }
      `}</style>
      <div className={`flex shrink-0 items-baseline gap-3 ${flow ? "" : "px-4 lg:px-0"} ${heading ? "justify-between" : "justify-end"}`}>
        {heading ? <h1 className="shrink-0 text-lg font-semibold leading-none">Müsaitlik</h1> : null}
        <p className="min-w-0 text-right text-sm leading-tight text-muted">{weekRange(grid.days[0]?.date ?? "", grid.days[6]?.date ?? "")}</p>
      </div>
      <div className={`mb-3 flex w-full max-w-full shrink-0 flex-wrap items-center justify-center gap-2 ${flow ? "" : "px-4 lg:px-0"}`} role="group" aria-label="Müsaitlik">
        {MODES.map((option) => {
          const on = mode === option.state;
          return (
            <button
              key={option.state}
              type="button"
              aria-pressed={on}
              onClick={() => setMode(option.state)}
              className={`court-press rounded-md border px-2 py-1 text-xs ${on ? "font-semibold" : ""}`}
              style={{ backgroundColor: option.backgroundColor, color: option.color, borderColor: option.borderColor }}
            >
              {option.word}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={mode === "CLEAR"}
          onClick={() => setMode("CLEAR")}
          className={`court-press rounded-md border bg-surface px-2 py-1 text-xs ${mode === "CLEAR" ? "font-semibold" : ""}`}
          style={{ color: "#4b5563", borderColor: "#6b7280" }}
        >
          Boş
        </button>
      </div>
      {notice ? (
        <p role="alert" className={`shrink-0 text-sm ${flow ? "" : "px-4 lg:px-0"}`} style={{ color: "#b91c1c" }}>
          {notice}
        </p>
      ) : null}
      <div className={`min-h-0 w-full lg:mx-auto lg:overflow-x-auto ${flow ? "lg:w-[95%]" : "lg:w-[70%] flex-1 lg:flex-none"}`}>
        <div
          className={`musait-board grid w-full min-w-full gap-x-1 gap-y-0.5 lg:h-auto lg:min-w-0 lg:w-full lg:gap-1 ${shortDays ? "musait-board-short" : ""} ${flow ? "h-auto" : "h-full"}`}
          style={{ "--musait-rows": String(grid.hours.length) } as CSSProperties}
        >
          <div />
          {grid.days.map((day) => (
            <div key={day.date} className="flex min-h-0 min-w-0 flex-col items-center justify-end overflow-visible pb-px text-center">
              {shortDays ? (
                <span className="whitespace-nowrap text-xs font-semibold leading-none">{day.short}</span>
              ) : (
                <>
                  <span className="text-xs font-semibold leading-none lg:hidden">{day.short}</span>
                  <span className="hidden max-w-full truncate text-sm font-semibold leading-none lg:block">{day.label}</span>
                  <span className="mt-px hidden text-[9px] font-normal leading-none text-muted lg:block">{day.date.slice(8)}</span>
                </>
              )}
            </div>
          ))}
          {grid.hours.map((hour) => (
            <Fragment key={hour}>
              <div className="flex items-center pl-0.5 whitespace-nowrap text-sm font-normal leading-none text-ink lg:py-1 lg:pl-0">{hour}</div>
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
