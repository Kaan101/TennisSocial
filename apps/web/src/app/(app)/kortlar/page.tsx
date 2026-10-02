"use client";

import { istanbulNowParts, type CourtPurpose } from "@club/shared";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { type DayGrid, type DaySlot, CourtDayGrid, clearReservations, groupDaySlots, paintPurpose, restoreSlots } from "@/components/court-day-grid";
import { type Reservation, shiftDate, weekdayOf } from "@/components/court-ui";
import { ErrorState, LoadingBlock } from "@/components/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useClub } from "@/lib/club";

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

function mondayOf(date: string): string {
  const weekday = weekdayOf(date);
  return shiftDate(date, weekday === 0 ? -6 : 1 - weekday);
}

function daysInWeek(grids: Map<string, DayGrid>, anchor: string): DayGrid[] {
  const monday = mondayOf(anchor);
  const days: DayGrid[] = [];
  for (let index = 0; index < 7; index += 1) {
    const day = grids.get(shiftDate(monday, index));
    if (day) days.push(day);
  }
  return days;
}

export default function CourtsPage() {
  const { user } = useAuth();
  const { clubId, ready } = useClub();
  const today = useCurrentDay();
  const [selected, setSelected] = useState<string[]>(() => [istanbulNowParts().day]);
  const selectedRef = useRef(selected);
  const shown = selected[0] ?? today;
  const shownWeek = mondayOf(shown);
  const [focus, setFocus] = useState<{ date: string; courtId: string; hour: string } | null>(null);
  const [grid, setGrid] = useState<DayGrid | null>(null);
  const [weekDays, setWeekDays] = useState<DayGrid[]>([]);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const dayRef = useRef(shown);
  const clubRef = useRef(clubId);
  const seenClub = useRef(clubId);
  const gridRef = useRef(grid);
  const weekGrids = useRef(new Map<string, DayGrid>());
  const paintEpoch = useRef(0);
  const dayEpoch = useRef(new Map<string, number>());
  const savedIds = useRef(new Map<string, string>());
  const cancelAfterSave = useRef(new Set<string>());

  useEffect(() => {
    selectedRef.current = selected;
    dayRef.current = shown;
    clubRef.current = clubId;
  });

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const date = query.get("date");
    const court = query.get("court");
    const hour = query.get("hour");
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      dayRef.current = date;
      selectedRef.current = [date];
      setSelected([date]);
    }
    if (date && court && hour) setFocus({ date, courtId: court, hour });
  }, []);

  useEffect(() => {
    if (seenClub.current === clubId) return;
    seenClub.current = clubId;
    weekGrids.current.clear();
    dayEpoch.current.clear();
    gridRef.current = null;
    setGrid(null);
    setWeekDays([]);
    setFailed(false);
  }, [clubId]);

  function publishDay(next: DayGrid, immediate = false) {
    paintEpoch.current += 1;
    dayEpoch.current.set(next.date, paintEpoch.current);
    weekGrids.current.set(next.date, next);
    const apply = () => {
      setWeekDays(daysInWeek(weekGrids.current, dayRef.current));
      if (dayRef.current !== next.date) return;
      gridRef.current = next;
      setGrid(next);
    };
    if (immediate) flushSync(apply);
    else apply();
  }

  function showPressedDay(date: string) {
    dayRef.current = date;
    selectedRef.current = [date];
    setSelected((current) => (current.length === 1 && current[0] === date ? current : [date]));
    const cached = weekGrids.current.get(date);
    if (!cached) {
      setWeekDays(daysInWeek(weekGrids.current, date));
      return;
    }
    setFailed(false);
    if (gridRef.current === cached) {
      setWeekDays(daysInWeek(weekGrids.current, date));
      return;
    }
    publishDay(cached, true);
  }

  useEffect(() => {
    if (!user || !ready) return;
    const week = Array.from({ length: 7 }, (_, index) => shiftDate(shownWeek, index));
    const requestedClub = clubId;
    const started = paintEpoch.current;
    let cancel = false;
    setFailed(false);
    for (const date of week) {
      const query = new URLSearchParams({ date });
      if (requestedClub) query.set("club", requestedClub);
      api<DayGrid>(`/courts/day?${query.toString()}`, { cache: "no-store" })
        .then((data) => {
          if (cancel || clubRef.current !== requestedClub) return;
          if ((dayEpoch.current.get(data.date) ?? 0) > started) return;
          weekGrids.current.set(data.date, data);
          setWeekDays(daysInWeek(weekGrids.current, dayRef.current));
          if (dayRef.current !== data.date) return;
          if (gridRef.current?.date === data.date && paintEpoch.current !== started) return;
          gridRef.current = data;
          setGrid(data);
          setFailed(false);
        })
        .catch(() => {
          if (cancel || clubRef.current !== requestedClub || dayRef.current !== date || weekGrids.current.has(date)) return;
          setFailed(true);
        });
    }
    return () => {
      cancel = true;
    };
  }, [shownWeek, retry, user, ready, clubId]);

  function showGrid(next: DayGrid | null, immediate = false) {
    if (!next) return;
    publishDay(next, immediate);
  }

  async function finishSavedSpan(id: string, span: { courtId: string; startTime: string; endTime: string }, date: string, snapshot: DayGrid | null) {
    for (const hour of hoursInSpan(span.startTime, span.endTime)) {
      const key = `local-${span.courtId}-${hour}`;
      savedIds.current.set(key, id);
      if (!cancelAfterSave.current.has(key)) continue;
      cancelAfterSave.current.delete(key);
      try {
        await api(`/reservations/${id}/cancel`, { method: "POST" });
      } catch {
        const current = weekGrids.current.get(date) ?? null;
        if (snapshot && current?.date === date) showGrid(restoreSlots(current, snapshot, [{ courtId: span.courtId, startTime: hour }]));
      }
    }
  }

  if (!user || (!grid && !failed)) return <LoadingBlock label="Kortlar yükleniyor" />;
  if (!grid && failed) return <ErrorState message="Gün tablosu yüklenemedi" onRetry={() => setRetry((value) => value + 1)} />;
  if (!grid) return null;

  return (
    <CourtDayGrid
      date={shown}
      today={today}
      week={weekDays}
      grid={grid}
      onDate={showPressedDay}
      focus={focus}
      failed={failed && grid.date !== shown}
      onRetry={() => setRetry((value) => value + 1)}
      onApply={async (input) => {
        const target = input.date;
        const snapshot = weekGrids.current.get(target) ?? (gridRef.current?.date === target ? gridRef.current : null);
        if (!snapshot || snapshot.date !== target) return;
        const dates = selectedRef.current.includes(target) ? [...selectedRef.current] : [target];
        showGrid(paintPurpose(snapshot, input.slots, input.purpose, user.role === "ADMIN" ? "APPROVED" : "PENDING"), true);
        const pending = input.slots.map((slot) => ({ ...slot }));
        for (const span of groupDaySlots(input.slots)) {
          try {
            const created = await postReservation(target, span, input.purpose);
            await finishSavedSpan(created.id, span, target, snapshot);
            dropSpan(pending, span);
          } catch {
            const current = weekGrids.current.get(target) ?? null;
            if (current?.date === target) showGrid(restoreSlots(current, snapshot, pending));
            return;
          }
        }
        await writeOtherDays(dates, target, (date) =>
          groupDaySlots(input.slots).map((span) => postReservation(date, span, input.purpose).then(() => undefined)),
        );
      }}
      onCancel={async (ids, matchOnly, date) => {
        const snapshot = weekGrids.current.get(date) ?? (gridRef.current?.date === date ? gridRef.current : null);
        if (!snapshot || snapshot.date !== date) return;
        const dates = selectedRef.current.includes(date) ? [...selectedRef.current] : [date];
        const slots = ids.flatMap((id) => slotsForReservation(snapshot, id));
        showGrid(clearReservations(snapshot, ids), true);
        const pending = slots.map((slot) => ({ ...slot }));
        for (const id of ids) {
          const serverId = savedIds.current.get(id) ?? id;
          if (serverId.startsWith("local-")) {
            cancelAfterSave.current.add(id);
            dropReservation(pending, snapshot, id);
            continue;
          }
          try {
            await api(`/reservations/${serverId}/cancel`, { method: "POST" });
            dropReservation(pending, snapshot, id);
          } catch {
            const current = weekGrids.current.get(date) ?? null;
            if (current?.date === date) showGrid(restoreSlots(current, snapshot, pending));
            return;
          }
        }
        await writeOtherDays(dates, date, (day) => slots.map((slot) => mutateOtherDay(day, slot.courtId, slot.startTime, matchOnly ? "cancel-match" : "clear")));
      }}
    />
  );
}

function postReservation(date: string, span: { courtId: string; startTime: string; endTime: string }, purpose: CourtPurpose) {
  return api<Reservation>("/reservations", {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({
      courtId: span.courtId,
      purpose,
      startDate: date,
      endDate: date,
      weekdays: [weekdayOf(date)],
      startTime: span.startTime,
      endTime: span.endTime,
      partnerId: null,
    }),
  });
}

function writeOtherDays(dates: string[], visible: string, jobs: (date: string) => Promise<void>[]): Promise<void> {
  const pending = dates.flatMap((date) => (date === visible ? [] : jobs(date).map((job) => job.catch(() => undefined))));
  return Promise.all(pending).then(() => undefined);
}

async function mutateOtherDay(date: string, courtId: string, hour: string, kind: "clear" | "cancel-match") {
  const query = new URLSearchParams({ date, courtId, hour });
  const data = await api<{ reservation: { id: string; purpose: CourtPurpose } | null }>(`/courts/slot?${query.toString()}`, { cache: "no-store" });
  const reservation = data.reservation;
  if (!reservation) return;
  if (kind === "cancel-match" && reservation.purpose !== "MATCH") return;
  await api(`/reservations/${reservation.id}/cancel`, { method: "POST" });
}

function hoursInSpan(startTime: string, endTime: string): string[] {
  const hours: string[] = [];
  let cursor = startTime;
  while (cursor < endTime && cursor <= "22:00") {
    hours.push(cursor);
    cursor = `${String(Number(cursor.slice(0, 2)) + 1).padStart(2, "0")}:00`;
  }
  return hours;
}

function dropSpan(pending: DaySlot[], span: { courtId: string; startTime: string; endTime: string }) {
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const slot = pending[index];
    if (slot && slot.courtId === span.courtId && slot.startTime >= span.startTime && slot.startTime < span.endTime) pending.splice(index, 1);
  }
}

function slotsForReservation(grid: DayGrid | null, id: string): DaySlot[] {
  if (!grid) return [];
  return grid.cells.flatMap((cell) => (cell.reservation?.id === id ? [{ courtId: cell.courtId, startTime: cell.startTime }] : []));
}

function dropReservation(pending: DaySlot[], grid: DayGrid | null, id: string) {
  const keys = new Set(slotsForReservation(grid, id).map((slot) => `${slot.courtId}|${slot.startTime}`));
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const slot = pending[index];
    if (slot && keys.has(`${slot.courtId}|${slot.startTime}`)) pending.splice(index, 1);
  }
}
