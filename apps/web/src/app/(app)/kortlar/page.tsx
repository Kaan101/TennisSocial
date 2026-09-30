"use client";

import { istanbulNowParts } from "@club/shared";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { type DayGrid, type DaySlot, CourtDayGrid, clearReservations, groupDaySlots, paintCheckedIn, paintPurpose, restoreSlots } from "@/components/court-day-grid";
import { type Reservation, weekdayOf } from "@/components/court-ui";
import { ErrorState, LoadingBlock } from "@/components/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function CourtsPage() {
  const { user } = useAuth();
  const [day, setDay] = useState(() => istanbulNowParts().day);
  const [focus, setFocus] = useState<{ date: string; courtId: string; hour: string } | null>(null);
  const [grid, setGrid] = useState<DayGrid | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const dayRef = useRef(day);
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
    if (date) setDay(date);
    if (date && court && hour) setFocus({ date, courtId: court, hour });
  }, []);

  useEffect(() => {
    dayRef.current = day;
    if (!user) return;
    const epoch = paintEpoch.current;
    const requested = day;
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
  }, [day, retry, user]);

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
      date={grid.date}
      onDate={setDay}
      grid={grid}
      focus={focus}
      onApply={async (input) => {
        const snapshot = gridRef.current;
        const date = snapshot?.date;
        if (!snapshot || !date) return;
        showGrid(paintPurpose(snapshot, input.slots, input.purpose, user.role === "ADMIN" ? "APPROVED" : "PENDING"), true);
        const pending = input.slots.map((slot) => ({ ...slot }));
        for (const span of groupDaySlots(input.slots)) {
          try {
            const created = await api<Reservation>("/reservations", {
              method: "POST",
              cache: "no-store",
              body: JSON.stringify({
                courtId: span.courtId,
                purpose: input.purpose,
                startDate: date,
                endDate: date,
                weekdays: [weekdayOf(date)],
                startTime: span.startTime,
                endTime: span.endTime,
                partnerId: null,
              }),
            });
            await finishSavedSpan(created.id, span, date, snapshot);
            dropSpan(pending, span);
          } catch {
            const current = gridRef.current;
            if (snapshot && current?.date === date) showGrid(restoreSlots(current, snapshot, pending));
            return;
          }
        }
      }}
      onCancel={async (ids) => {
        const snapshot = gridRef.current;
        const date = snapshot?.date;
        if (!snapshot || !date) return;
        showGrid(clearReservations(snapshot, ids), true);
        const pending = ids.flatMap((id) => slotsForReservation(snapshot, id));
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
            if (snapshot && current?.date === date) showGrid(restoreSlots(current, snapshot, pending));
            return;
          }
        }
      }}
      onCheckIn={async (slots) => {
        const snapshot = gridRef.current;
        const date = snapshot?.date;
        if (!snapshot || !date) return;
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
            if (snapshot && current?.date === date) showGrid(restoreSlots(current, snapshot, pending));
            return;
          }
        }
      }}
    />
  );
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
