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
  kindClass,
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
        Kapalı 1–3 balon korttur. Kort 1–9 onların ardından gelir. Bir korta dokun, haftasını gör.
      </p>
      {message ? <p className="rounded-2xl bg-surface px-3 py-2 text-sm" role="status">{message}</p> : null}

      <div className="hidden overflow-hidden rounded-3xl border border-line md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Kulüp kortları</caption>
          <thead className="bg-paper text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Kort</th>
              <th className="px-4 py-3 font-semibold">Tür</th>
              <th className="px-4 py-3 font-semibold">Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((court) => (
              <tr key={court.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/kortlar/${court.id}`} className="font-semibold underline-offset-2 hover:underline">{court.name}</Link>
                </td>
                <td className="px-4 py-3"><span className={kindClass(court.kind)}>{court.kindLabel}</span></td>
                <td className="px-4 py-3 text-muted">{court.active ? "Aktif" : "Pasif"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {rows.map((court) => (
          <li key={court.id}>
            <Link href={`/kortlar/${court.id}`} className="flex items-center justify-between rounded-3xl border border-line bg-surface px-4 py-3">
              <span className="font-semibold">{court.name}</span>
              <span className={kindClass(court.kind)}>{court.kindLabel}</span>
            </Link>
          </li>
        ))}
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
