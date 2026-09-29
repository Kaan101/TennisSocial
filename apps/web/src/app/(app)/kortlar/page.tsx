"use client";

import Link from "next/link";
import { useState } from "react";
import {
  type CourtRow,
  type Person,
  type Reservation,
  AdminCourts,
  PendingQueue,
  RequestForm,
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
  const courts = useResource<{ data: CourtRow[] }>(user ? (user.role === "ADMIN" ? "/courts?all=true" : "/courts") : null);
  const requests = useResource<{ data: Reservation[] }>(user ? "/reservations?status=PENDING&pageSize=50" : null);
  const roster = useResource<{ data: Person[] }>(user ? "/players/search?pageSize=50" : null);
  const lead = useResource<{ hours: number }>(user?.role === "ADMIN" ? "/settings/check-in-lead" : null);

  async function refresh() {
    await Promise.all([courts.reload(), requests.reload(), lead.reload()]);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setMessage(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "İşlem tamamlanamadı");
    } finally {
      setBusy(false);
    }
  }

  if (courts.loading || !user) return <LoadingBlock label="Kortlar yükleniyor" />;
  if (courts.error || !courts.data) return <ErrorState message={courts.error ?? "Kortlar açılmadı"} onRetry={() => void courts.reload()} />;

  const rows = courts.data.data;

  return (
    <div className="space-y-4">
      <PageHeader title="Kortlar" action={<Link href="/takvim" className="text-sm font-semibold text-court">Takvim</Link>} />
      <p className="text-sm text-muted">
        Kapalı 1–3 balon korttur, mavi çerçeve. Kort 1–9 yeşil çerçeve. Bir korta dokun, haftasını gör.
      </p>
      {message ? <p className="rounded-2xl bg-surface px-3 py-2 text-sm" role="status">{message}</p> : null}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
        {rows.map((court) => {
          const balloon = court.kind === "BALLOON";
          return (
            <li key={court.id}>
              <Link
                href={`/kortlar/${court.id}`}
                className={`flex min-h-24 flex-col justify-between rounded-3xl border-2 px-3 py-3 ${balloon ? "border-[#2563eb] bg-[#eff6ff]" : "border-court bg-court/10"} ${court.active ? "" : "opacity-60"}`}
              >
                <span className="text-base font-semibold leading-tight">{court.name}</span>
                <span className="text-xs text-muted">{court.kindLabel}{court.active ? "" : " · pasif"}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <PendingQueue
        items={requests.data?.data ?? []}
        canApprove={user.role === "ADMIN"}
        busy={busy}
        onApprove={(id) => void run(async () => { await api(`/reservations/${id}/approve`, { method: "POST" }); })}
        onReject={(id) => void run(async () => { await api(`/reservations/${id}/reject`, { method: "POST" }); })}
      />

      <RequestForm
        courts={rows}
        role={user.role}
        hours={HOURS}
        people={(roster.data?.data ?? []).filter((person) => person.id !== user.id)}
        busy={busy}
        onSubmit={(body, approved) => void run(async () => {
          await api("/reservations", { method: "POST", body: JSON.stringify(body) });
          setMessage(approved ? "Rezervasyon onaylı kaydedildi." : "Talep yönetici onayına düştü.");
        })}
      />

      {user.role === "ADMIN" ? (
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
