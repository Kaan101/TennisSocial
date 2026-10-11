"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/player-card";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

type ManagedPlayer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  accountRole: "USER" | "OFFICIAL" | "ADMIN";
  blocked: boolean;
};

type ParameterRow = {
  key: "matchWindowDays" | "scheduleHours" | "cooldownDays" | "checkInLeadHours";
  label: string;
  min: number;
  max: number;
  value: number;
};

const actionClass = "court-press rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-50";

export default function YonetimPage() {
  const { user, loading } = useAuth();
  const isAdmin = user?.accountRole === "ADMIN";
  const players = useResource<{ data: ManagedPlayer[] }>(isAdmin ? "/admin/players" : null);
  const parameters = useResource<{ parameters: ParameterRow[] }>(isAdmin ? "/admin/parameters" : null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!parameters.data) return;
    const next: Record<string, string> = {};
    for (const row of parameters.data.parameters) next[row.key] = String(row.value);
    setDraft(next);
  }, [parameters.data]);

  async function saveParameters(event: React.FormEvent) {
    event.preventDefault();
    if (!parameters.data) return;
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, number> = {};
      for (const row of parameters.data.parameters) {
        const value = Number(draft[row.key]);
        if (!Number.isInteger(value) || value < row.min || value > row.max) {
          setMessage(`${row.label} ${row.min} ile ${row.max} arasında olmalı`);
          setSaving(false);
          return;
        }
        body[row.key] = value;
      }
      const saved = await api<{ parameters: ParameterRow[] }>("/admin/parameters", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      parameters.setData(saved);
      setMessage("Parametreler kaydedildi");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Parametreler kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  async function removePlayer(id: string) {
    setBusyId(id);
    setMessage(null);
    try {
      await api(`/admin/players/${id}`, { method: "DELETE" });
      setConfirmId(null);
      await players.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Oyuncu silinemedi");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleBlock(player: ManagedPlayer) {
    setBusyId(player.id);
    setMessage(null);
    try {
      await api(`/admin/players/${player.id}/${player.blocked ? "unblock" : "block"}`, { method: "POST" });
      await players.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Bloke durumu değişmedi");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingBlock label="Yönetim yükleniyor" />;
  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title="Yönetim" />
        <p className="text-sm text-muted">Bu sayfa yalnızca yöneticiye açık.</p>
      </div>
    );
  }

  const rows = players.data?.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Yönetim" />
      {user ? <p className="text-sm font-semibold text-ink">{user.firstName} {user.lastName}</p> : null}
      {message ? <p className="text-sm">{message}</p> : null}

      <section className="rounded-3xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Parametreler</h2>
        {parameters.loading ? <div className="mt-3"><LoadingBlock label="Parametreler yükleniyor" /></div> : null}
        {parameters.error ? <div className="mt-3"><ErrorState message={parameters.error} onRetry={() => void parameters.reload()} /></div> : null}
        {parameters.data ? (
          <form className="mt-3 space-y-3" onSubmit={(event) => void saveParameters(event)}>
            {parameters.data.parameters.map((row) => (
              <label key={row.key} className="block text-sm">
                {row.label}
                <Input
                  aria-label={row.label}
                  type="number"
                  min={row.min}
                  max={row.max}
                  value={draft[row.key] ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, [row.key]: event.target.value }))}
                  className="mt-1 h-9"
                />
              </label>
            ))}
            <button type="submit" disabled={saving} className={actionClass}>Kaydet</button>
          </form>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-3xl border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Oyuncular</h2>
        {players.loading ? <div className="p-4"><LoadingBlock label="Oyuncular yükleniyor" /></div> : null}
        {players.error ? <div className="p-4"><ErrorState message={players.error} onRetry={() => void players.reload()} /></div> : null}
        {players.data && rows.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Oyuncu yok" body="Sistemde görünecek kayıtlı oyuncu kalmadı." />
          </div>
        ) : null}
        {rows.length > 0 ? (
          <ul className="divide-y divide-line">
            {rows.map((player) => {
              const self = player.id === user?.id;
              const name = `${player.firstName} ${player.lastName}`.trim() || player.email;
              const confirming = confirmId === player.id;
              return (
                <li key={player.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar first={player.firstName} last={player.lastName} photo={null} className="h-10 w-10 shrink-0 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted">{player.email}</p>
                  </div>
                  {player.blocked ? <span className="text-xs font-semibold text-clay">Bloke</span> : null}
                  {self ? <span className="text-xs text-muted">Sen</span> : null}
                  {self ? null : confirming ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs">Bu oyuncu sistemden silinsin mi?</span>
                      <button type="button" disabled={busyId === player.id} className={actionClass} onClick={() => void removePlayer(player.id)}>Sil</button>
                      <button type="button" className={actionClass} onClick={() => setConfirmId(null)}>Vazgeç</button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={actionClass} onClick={() => setConfirmId(player.id)}>Sil</button>
                      <button type="button" disabled={busyId === player.id} className={actionClass} onClick={() => void toggleBlock(player)}>
                        {player.blocked ? "Bloğu kaldır" : "Bloke"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
