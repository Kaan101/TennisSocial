"use client";

import type { AvailabilityState } from "@club/shared";
import { istanbulNowParts } from "@club/shared";
import { Fragment, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { shiftDate } from "@/components/court-ui";
import { ErrorState, LoadingBlock } from "@/components/states";
import { api } from "@/lib/api";

type Manual = AvailabilityState | null;

type Cell = {
  date: string;
  startTime: string;
  manual: Manual;
  match: boolean;
};

type WeekGrid = {
  weekStart: string;
  hours: string[];
  days: { date: string; weekday: number; label: string; short: string }[];
  cells: Cell[];
};

const MODES: { state: AvailabilityState; word: string; backgroundColor: string; color: string }[] = [
  { state: "FULL", word: "Tam", backgroundColor: "#16a34a", color: "#ffffff" },
  { state: "MAYBE", word: "Belki", backgroundColor: "#bbf7d0", color: "#14241c" },
  { state: "BUSY", word: "Dolu", backgroundColor: "#fecaca", color: "#14241c" },
];

function paintCell(grid: WeekGrid, date: string, startTime: string, manual: Manual): WeekGrid {
  return {
    ...grid,
    cells: grid.cells.map((cell) => (cell.date === date && cell.startTime === startTime && !cell.match ? { ...cell, manual } : cell)),
  };
}

function cellFill(cell: Cell): { backgroundColor: string; color: string } {
  if (cell.match) return { backgroundColor: "#166534", color: "#ffffff" };
  if (cell.manual === "FULL") return { backgroundColor: "#16a34a", color: "#ffffff" };
  if (cell.manual === "MAYBE") return { backgroundColor: "#bbf7d0", color: "#14241c" };
  if (cell.manual === "BUSY") return { backgroundColor: "#fecaca", color: "#14241c" };
  return { backgroundColor: "#fffdf8", color: "#14241c" };
}

function cellWord(cell: Cell): string {
  if (cell.match) return "maç";
  if (cell.manual === "FULL") return "tam";
  if (cell.manual === "MAYBE") return "belki";
  if (cell.manual === "BUSY") return "dolu";
  return "boş";
}

export default function AvailabilityCalendarPage() {
  const [week, setWeek] = useState(() => istanbulNowParts().day);
  const [grid, setGrid] = useState<WeekGrid | null>(null);
  const [mode, setMode] = useState<AvailabilityState | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const gridRef = useRef(grid);
  const paintEpoch = useRef(0);
  const weekRef = useRef(week);

  useEffect(() => {
    weekRef.current = week;
    const epoch = paintEpoch.current;
    const requested = week;
    let cancel = false;
    api<WeekGrid>(`/me/availability-week?week=${requested}`, { cache: "no-store" })
      .then((data) => {
        if (cancel || weekRef.current !== requested) return;
        const sameWeek = gridRef.current?.weekStart === data.weekStart;
        if (sameWeek && paintEpoch.current !== epoch) return;
        gridRef.current = data;
        setGrid(data);
        setFailed(false);
      })
      .catch(() => {
        if (cancel || weekRef.current !== requested || gridRef.current) return;
        setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, [week, retry]);

  function showGrid(next: WeekGrid) {
    gridRef.current = next;
    flushSync(() => setGrid(next));
  }

  function onCell(date: string, startTime: string) {
    if (!mode) return;
    const snapshot = gridRef.current;
    const cell = snapshot?.cells.find((item) => item.date === date && item.startTime === startTime);
    if (!snapshot || !cell || cell.match || cell.manual === mode) return;
    const previous = cell.manual;
    paintEpoch.current += 1;
    showGrid(paintCell(snapshot, date, startTime, mode));
    void api("/me/availability-cells", {
      method: "POST",
      body: JSON.stringify({ date, startTime, state: mode }),
    }).catch(() => {
      const current = gridRef.current;
      if (!current || current.weekStart !== snapshot.weekStart) return;
      const restored = paintCell(current, date, startTime, previous);
      gridRef.current = restored;
      setGrid(restored);
    });
  }

  if (!grid && !failed) return <LoadingBlock label="Müsaitlik yükleniyor" />;
  if (!grid && failed) return <ErrorState message="Müsaitlik yüklenemedi" onRetry={() => setRetry((value) => value + 1)} />;

  if (!grid) return null;

  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <h1 className="text-sm font-semibold">Müsaitlik</h1>
      <div className="flex w-full min-w-0 items-center gap-3 text-sm">
        <button type="button" className="court-press shrink-0 py-1" onClick={() => setWeek(shiftDate(grid.weekStart, -7))}>önceki</button>
        <p className="min-w-0 flex-1 text-center text-xs text-muted">{grid.days[0]?.date} – {grid.days[6]?.date}</p>
        <button type="button" className="court-press shrink-0 py-1" onClick={() => setWeek(shiftDate(grid.weekStart, 7))}>sonraki</button>
      </div>
      <div className="inline-flex max-w-full flex-wrap items-center justify-start gap-2 md:pl-[3.25rem]" role="group" aria-label="Müsaitlik">
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
      </div>
      <div className="w-full min-w-0 overflow-x-auto">
        <div
          className="grid min-w-[36rem] gap-0.5"
          style={{ gridTemplateColumns: `3.25rem repeat(${grid.days.length}, minmax(2.6rem, 1fr))` }}
        >
          <div />
          {grid.days.map((day) => (
            <div key={day.date} className="px-0.5 pb-1 text-center text-[10px] font-semibold leading-tight">
              <span className="md:hidden">{day.short}</span>
              <span className="hidden md:inline">{day.label}</span>
              <span className="mt-0.5 block font-normal text-muted">{day.date.slice(8)}</span>
            </div>
          ))}
          {grid.hours.map((hour) => (
            <Fragment key={hour}>
              <div className="py-1 text-[10px] font-bold text-ink">{hour}</div>
              {grid.days.map((day) => {
                const cell = grid.cells.find((item) => item.date === day.date && item.startTime === hour);
                const word = cell ? cellWord(cell) : "boş";
                return (
                  <button
                    key={day.date}
                    type="button"
                    aria-label={`${day.label} ${hour} ${word}`}
                    onClick={() => onCell(day.date, hour)}
                    className="court-press block min-h-6 w-full rounded-sm border border-line"
                    style={cell ? { ...cellFill(cell), borderRadius: 4 } : { backgroundColor: "#fffdf8", borderRadius: 4 }}
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
