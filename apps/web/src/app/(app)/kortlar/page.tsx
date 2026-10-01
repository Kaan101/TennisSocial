"use client";

import { istanbulNowParts, type CourtPurpose } from "@club/shared";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { type DayGrid, type DaySlot, CourtDayGrid, clearReservations, groupDaySlots, paintCheckedIn, paintPurpose, restoreSlots } from "@/components/court-day-grid";
import { type Reservation, shiftDate, weekdayOf } from "@/components/court-ui";
import { ErrorState, LoadingBlock } from "@/components/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

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

export default function CourtsPage() {
  const { user } = useAuth();
  const today = useCurrentDay();
  const [selected, setSelected] = useState<string[]>(() => [istanbulNowParts().day]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const shown = selected[0] ?? today;
  const [focus, setFocus] = useState<{ date: string; courtId: string; hour: string } | null>(null);
  const [grid, setGrid] = useState<DayGrid | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const dayRef = useRef(shown);
  const gridRef = useRef(grid);
  const paintEpoch = useRef(0);
  const savedIds = useRef(new Map<string, string>());
  const cancelAfterSave = useRef(new Set<string>());
  const checkInAfterSave = useRef(new Map<string, { courtId: string; date: string; startTime: string }>());

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const date = query.get("date");
    const court = query.get("court");
    const hour = query.get("hour");
    if (date && court && hour && date === istanbulNowParts().day) setFocus({ date, courtId: court, hour });
  }, []);

  useEffect(() => {
    const weekday = weekdayOf(today);
    const monday = shiftDate(today, weekday === 0 ? -6 : 1 - weekday);
    const week = Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
    setSelected((current) => {
      const kept = current.filter((date) => week.includes(date));
      if (kept.length === current.length && kept.every((date, index) => date === current[index])) return current;
      return kept.length > 0 ? kept : [today];
    });
  }, [today]);

  function toggleDay(date: string) {
    setSelected((current) => {
      if (!current.includes(date)) return [...current, date];
      if (current.length === 1) return current;
      return current.filter((item) => item !== date);
    });
  }

  useEffect(() => {
    dayRef.current = shown;
    if (!user) return;
    const epoch = paintEpoch.current;
    const requested = shown;
    let cancel = false;
    api<DayGrid>(`/courts/day?date=${requested}`, { cache: "no-store" })
      .then((data) => {
        if (cancel || dayRef.current !== requested) return;
        const sameDay = gridRef.current?.date === data.date;
        if (sameDay && paintEpoch.current !== epoch) return;
        gridRef.current = data;
        setGrid(data);
        setFailed(false);
      })
      .catch(() => {
        if (cancel || dayRef.current !== requested || gridRef.current) return;
        setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, [shown, retry, user]);

  function showGrid(next: DayGrid | null, immediate = false) {
    if (!next || next.date !== gridRef.current?.date) return;
    paintEpoch.current += 1;
    gridRef.current = next;
    if (immediate) flushSync(() => setGrid(next));
    else setGrid(next);
  }

  async function finishSavedSpan(id: string, span: { courtId: string; startTime: string; endTime: string }, date: string, snapshot: DayGrid | null) {
    for (const hour of hoursInSpan(span.startTime, span.endTime)) {
      const key = `local-${span.courtId}-${hour}`;
      savedIds.current.set(key, id);
      if (cancelAfterSave.current.has(key)) {
        cancelAfterSave.current.delete(key);
        try {
          await api(`/reservations/${id}/cancel`, { method: "POST" });
        } catch {
          const current = gridRef.current;
          if (snapshot && current?.date === date) showGrid(restoreSlots(current, snapshot, [{ courtId: span.courtId, startTime: hour }]));
        }
        continue;
      }
      const check = checkInAfterSave.current.get(key);
      if (!check) continue;
      checkInAfterSave.current.delete(key);
      try {
        await api(`/reservations/${id}/check-in`, {
          method: "POST",
          body: JSON.stringify({ date: check.date, startTime: check.startTime }),
        });
      } catch {
        const current = gridRef.current;
        if (current?.date === date) showGrid(uncheckSlot(current, check.courtId, check.startTime));
      }
    }
  }

  if (!user || (!grid && !failed)) return <LoadingBlock label="Kortlar yükleniyor" />;
  if (!grid && failed) return <ErrorState message="Gün tablosu yüklenemedi" onRetry={() => setRetry((value) => value + 1)} />;
  if (!grid) return null;

  return (
    <CourtDayGrid
      date={shown}
      selected={selected}
      onToggleDay={toggleDay}
      grid={grid}
      focus={focus}
      onApply={async (input) => {
        const snapshot = gridRef.current;
        const visible = snapshot?.date;
        if (!snapshot || !visible) return;
        const dates = [...selectedRef.current];
        showGrid(paintPurpose(snapshot, input.slots, input.purpose, user.role === "ADMIN" ? "APPROVED" : "PENDING"), true);
        const pending = input.slots.map((slot) => ({ ...slot }));
        for (const span of groupDaySlots(input.slots)) {
          try {
            const created = await postReservation(visible, span, input.purpose);
            await finishSavedSpan(created.id, span, visible, snapshot);
            dropSpan(pending, span);
          } catch {
            const current = gridRef.current;
            if (snapshot && current?.date === visible) showGrid(restoreSlots(current, snapshot, pending));
            return;
          }
        }
        await writeOtherDays(dates, visible, (date) =>
          groupDaySlots(input.slots).map((span) => postReservation(date, span, input.purpose).then(() => undefined)),
        );
      }}
      onCancel={async (ids, matchOnly) => {
        const snapshot = gridRef.current;
        const visible = snapshot?.date;
        if (!snapshot || !visible) return;
        const dates = [...selectedRef.current];
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
            const current = gridRef.current;
            if (snapshot && current?.date === visible) showGrid(restoreSlots(current, snapshot, pending));
            return;
          }
        }
        await writeOtherDays(dates, visible, (date) => slots.map((slot) => mutateOtherDay(date, slot.courtId, slot.startTime, matchOnly ? "cancel-match" : "clear")));
      }}
      onCheckIn={async (slots) => {
        const snapshot = gridRef.current;
        const visible = snapshot?.date;
        if (!snapshot || !visible) return;
        const dates = [...selectedRef.current];
        showGrid(paintCheckedIn(snapshot, slots), true);
        const pending = slots.map((slot) => ({ courtId: slot.courtId, startTime: slot.startTime }));
        for (const slot of slots) {
          const serverId = savedIds.current.get(slot.reservationId) ?? slot.reservationId;
          if (serverId.startsWith("local-")) {
            checkInAfterSave.current.set(slot.reservationId, { courtId: slot.courtId, date: slot.date, startTime: slot.startTime });
            const index = pending.findIndex((item) => item.courtId === slot.courtId && item.startTime === slot.startTime);
            if (index >= 0) pending.splice(index, 1);
            continue;
          }
          try {
            await api(`/reservations/${serverId}/check-in`, {
              method: "POST",
              body: JSON.stringify({ date: slot.date, startTime: slot.startTime }),
            });
            const index = pending.findIndex((item) => item.courtId === slot.courtId && item.startTime === slot.startTime);
            if (index >= 0) pending.splice(index, 1);
          } catch {
            const current = gridRef.current;
            if (snapshot && current?.date === visible) showGrid(restoreSlots(current, snapshot, pending));
            return;
          }
        }
        await writeOtherDays(dates, visible, (date) => slots.map((slot) => mutateOtherDay(date, slot.courtId, slot.startTime, "checkin")));
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

async function mutateOtherDay(date: string, courtId: string, hour: string, kind: "clear" | "cancel-match" | "checkin") {
  const query = new URLSearchParams({ date, courtId, hour });
  const data = await api<{ reservation: { id: string; purpose: CourtPurpose; checkedIn: boolean } | null }>(`/courts/slot?${query.toString()}`, { cache: "no-store" });
  const reservation = data.reservation;
  if (!reservation) return;
  if (kind !== "clear" && reservation.purpose !== "MATCH") return;
  if (kind === "checkin") {
    if (reservation.checkedIn) return;
    await api(`/reservations/${reservation.id}/check-in`, {
      method: "POST",
      body: JSON.stringify({ date, startTime: hour }),
    });
    return;
  }
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

function uncheckSlot(grid: DayGrid, courtId: string, startTime: string): DayGrid {
  return {
    ...grid,
    cells: grid.cells.map((cell) => {
      if (cell.courtId !== courtId || cell.startTime !== startTime || !cell.reservation) return cell;
      return { ...cell, reservation: { ...cell.reservation, checkedIn: false, canCheckIn: true } };
    }),
  };
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
