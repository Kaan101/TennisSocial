"use client";

import { istanbulNowParts } from "@club/shared";
import { useEffect, useRef, useState } from "react";
import { type DayGrid, CourtDayGrid, groupDaySlots, paintDayGrid } from "@/components/court-day-grid";
import { type Reservation, weekdayOf } from "@/components/court-ui";
import { LoadingBlock } from "@/components/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

export default function CourtsPage() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
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

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
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
      busy={busy}
      onApply={(input) => run(async () => {
        const date = dayRef.current;
        let painted = gridRef.current;
        for (const span of groupDaySlots(input.slots)) {
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
          if (painted && painted.date === date) {
            painted = paintDayGrid(painted, created);
            gridRef.current = painted;
            if (date === dayRef.current) dayBoard.setData(painted);
          }
        }
        await loadDay(date);
      })}
      onCancel={(ids) => run(async () => {
        for (const id of ids) {
          await api(`/reservations/${id}/cancel`, { method: "POST" });
        }
        await loadDay(dayRef.current);
      })}
      onCheckIn={(slots) => run(async () => {
        for (const slot of slots) {
          await api(`/reservations/${slot.reservationId}/check-in`, {
            method: "POST",
            body: JSON.stringify({ date: slot.date, startTime: slot.startTime }),
          });
        }
        await loadDay(dayRef.current);
      })}
    />
  );
}
