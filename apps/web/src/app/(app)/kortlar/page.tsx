"use client";

import { istanbulNowParts } from "@club/shared";
import Link from "next/link";
import { useRef, useState } from "react";
import { type DayGrid, CourtDayGrid, groupDaySlots, paintDayGrid } from "@/components/court-day-grid";
import {
  type CourtRow,
  type Person,
  type Reservation,
  AdminCourts,
  PendingQueue,
  RequestForm,
  weekdayOf,
} from "@/components/court-ui";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

const HOURS = Array.from({ length: 15 }, (_, index) => `${String(8 + index).padStart(2, "0")}:00`);

export default function CourtsPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState(() => istanbulNowParts().day);
  const dayRef = useRef(day);
  dayRef.current = day;
  const courts = useResource<{ data: CourtRow[] }>(user ? (user.role === "ADMIN" ? "/courts?all=true" : "/courts") : null);
  const dayBoard = useResource<DayGrid>(user ? `/courts/day?date=${day}` : null);
  const requests = useResource<{ data: Reservation[] }>(user ? "/reservations?status=PENDING&pageSize=50" : null);
  const roster = useResource<{ data: Person[] }>(user ? "/players/search?pageSize=50" : null);
  const lead = useResource<{ hours: number }>(user?.role === "ADMIN" ? "/settings/check-in-lead" : null);
  const gridRef = useRef(dayBoard.data);
  gridRef.current = dayBoard.data;

  async function loadDay(date: string) {
    const fresh = await api<DayGrid>(`/courts/day?date=${date}`, { cache: "no-store" });
    if (fresh.date === dayRef.current) dayBoard.setData(fresh);
    return fresh;
  }

  async function refresh() {
    await Promise.all([courts.reload(), requests.reload(), lead.reload(), loadDay(dayRef.current)]);
  }

  async function run(action: () => Promise<string | void>): Promise<boolean> {
    setBusy(true);
    try {
      const note = await action();
      setMessage(note ?? null);
      await refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "İşlem tamamlanamadı");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <LoadingBlock label="Kortlar yükleniyor" />;

  const rows = courts.data?.data ?? [];
  const people = (roster.data?.data ?? []).filter((person) => person.id !== user.id);

  return (
    <div className="space-y-4">
      <PageHeader title="Kortlar" action={<Link href="/takvim" className="text-sm font-semibold text-court">Takvim</Link>} />
      <p className="text-sm text-muted">
        Boş saatler açık yeşil. Saat seç, sonra Maç, Antrenman, Turnuva veya Bakım uygula. Dar ekranda kortun saatleri açılır.
      </p>
      {message ? <p className="rounded-2xl bg-surface px-3 py-2 text-sm" role="status">{message}</p> : null}

      <CourtDayGrid
        date={day}
        onDate={setDay}
        grid={dayBoard.data}
        loading={dayBoard.loading}
        error={dayBoard.error}
        onRetry={() => void loadDay(day)}
        people={people}
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
                partnerId: input.purpose === "MATCH" ? input.partnerId : null,
              }),
            });
            if (painted && painted.date === date) {
              painted = paintDayGrid(painted, created);
              gridRef.current = painted;
              if (date === dayRef.current) dayBoard.setData(painted);
            }
          }
          await loadDay(date);
          return user.role === "ADMIN" ? "Rezervasyon onaylı kaydedildi." : "Talep yönetici onayına düştü.";
        })}
        onCheckIn={(reservationId, slotDate, startTime) => run(async () => {
          await api(`/reservations/${reservationId}/check-in`, {
            method: "POST",
            body: JSON.stringify({ date: slotDate, startTime }),
          });
          return "Check-in alındı.";
        })}
      />

      <PendingQueue
        items={requests.data?.data ?? []}
        canApprove={user.role === "ADMIN"}
        busy={busy}
        onApprove={(id) => void run(async () => { await api(`/reservations/${id}/approve`, { method: "POST" }); })}
        onReject={(id) => void run(async () => { await api(`/reservations/${id}/reject`, { method: "POST" }); })}
      />

      {courts.error ? <ErrorState message={courts.error} onRetry={() => void courts.reload()} /> : null}

      {rows.length > 0 ? (
        <RequestForm
          courts={rows}
          role={user.role}
          hours={HOURS}
          people={people}
          busy={busy}
          onSubmit={(body, approved) => void run(async () => {
            await api("/reservations", { method: "POST", body: JSON.stringify(body) });
            return approved ? "Rezervasyon onaylı kaydedildi." : "Talep yönetici onayına düştü.";
          })}
        />
      ) : null}

      {user.role === "ADMIN" && rows.length > 0 ? (
        <AdminCourts
          courts={rows}
          lead={lead.data?.hours ?? 3}
          busy={busy}
          onCreate={(name) => void run(async () => { await api("/courts", { method: "POST", body: JSON.stringify({ name }) }); })}
          onToggle={(court) => void run(async () => { await api(`/courts/${court.id}`, { method: "PATCH", body: JSON.stringify({ active: !court.active }) }); })}
          onLead={(hours) => void run(async () => { await api("/settings/check-in-lead", { method: "PATCH", body: JSON.stringify({ hours }) }); })}
        />
      ) : null}
    </div>
  );
}
