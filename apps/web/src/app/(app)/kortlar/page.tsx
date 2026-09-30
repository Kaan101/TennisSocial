"use client";

import { istanbulNowParts } from "@club/shared";
import { useEffect, useRef, useState } from "react";
import { type DayGrid, CourtDayGrid, clearReservations, groupDaySlots, paintCheckedIn, paintPurpose } from "@/components/court-day-grid";
import { type Reservation, weekdayOf } from "@/components/court-ui";
import { LoadingBlock } from "@/components/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

export default function CourtsPage() {
  const { user } = useAuth();
  const [day, setDay] = useState(() => istanbulNowParts().day);
  const dayRef = useRef(day);
  const dayBoard = useResource<DayGrid>(user ? `/courts/day?date=${day}` : null);
  const gridRef = useRef(dayBoard.data);
  useEffect(() => {
    dayRef.current = day;
    gridRef.current = dayBoard.data;
  }, [day, dayBoard.data]);

  async function loadDay(date: string) {
    const fresh = await api<DayGrid>(`/courts/day?date=${date}`, { cache: "no-store" });
    if (fresh.date === dayRef.current) {
      dayBoard.setData(fresh);
      gridRef.current = fresh;
    }
    return fresh;
  }

  function showGrid(next: DayGrid | null) {
    if (!next || next.date !== dayRef.current) return;
    gridRef.current = next;
    dayBoard.setData(next);
  }

  if (!user) return <LoadingBlock label="Kortlar yükleniyor" />;

  return (
    <CourtDayGrid
      date={day}
      onDate={setDay}
      grid={dayBoard.data}
      loading={dayBoard.loading}
      error={dayBoard.error}
      onRetry={() => void loadDay(day)}
      onApply={async (input) => {
        const date = dayRef.current;
        const snapshot = gridRef.current;
        if (snapshot?.date === date) showGrid(paintPurpose(snapshot, input.slots, input.purpose, user.role === "ADMIN" ? "APPROVED" : "PENDING"));
        try {
          for (const span of groupDaySlots(input.slots)) {
            await api<Reservation>("/reservations", {
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
          }
        } catch {
          showGrid(snapshot);
          return;
        }
        try {
          await loadDay(date);
        } catch {
          /* painted cells stay until the next day load */
        }
      }}
      onCancel={async (ids) => {
        const date = dayRef.current;
        const snapshot = gridRef.current;
        if (snapshot?.date === date) showGrid(clearReservations(snapshot, ids));
        try {
          for (const id of ids) {
            await api(`/reservations/${id}/cancel`, { method: "POST" });
          }
        } catch {
          showGrid(snapshot);
          return;
        }
        try {
          await loadDay(date);
        } catch {
          /* painted cells stay until the next day load */
        }
      }}
      onCheckIn={async (slots) => {
        const date = dayRef.current;
        const snapshot = gridRef.current;
        if (snapshot?.date === date) showGrid(paintCheckedIn(snapshot, slots));
        try {
          for (const slot of slots) {
            await api(`/reservations/${slot.reservationId}/check-in`, {
              method: "POST",
              body: JSON.stringify({ date: slot.date, startTime: slot.startTime }),
            });
          }
        } catch {
          showGrid(snapshot);
          return;
        }
        try {
          await loadDay(date);
        } catch {
          /* painted cells stay until the next day load */
        }
      }}
    />
  );
}
