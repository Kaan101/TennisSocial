"use client";

import { VISIBILITIES, VISIBILITY_LABELS, type Visibility } from "@club/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/states";

const fields = [
  ["phoneVisibility", "Telefon"],
  ["whatsappVisibility", "WhatsApp"],
  ["emailVisibility", "E-posta"],
  ["addressVisibility", "Tam adres"],
  ["birthYearVisibility", "Doğum yılı"],
  ["availabilityVisibility", "Müsaitlik"],
  ["matchHistoryVisibility", "Maç geçmişi"],
  ["tennisProfileVisibility", "Tenis profili"],
  ["activityVisibility", "Akış"],
] as const;

type Privacy = Record<(typeof fields)[number][0], Visibility>;

export default function PrivacyPage() {
  const { user } = useAuth();
  const { data, error, loading } = useResource<Privacy>(user ? `/users/${user.id}/privacy` : null);
  const [form, setForm] = useState<Privacy | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);
  if (loading || !user) return <LoadingBlock />;
  if (error || !form) return <ErrorState message={error ?? "Gizlilik ayarı açılmadı"} />;
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await api(`/users/${user.id}/privacy`, { method: "PUT", body: JSON.stringify(form) });
          setMessage("Gizlilik ayarın kaydedildi.");
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Kaydedilemedi");
        }
      }}
    >
      <PageHeader title="Gizlilik" />
      <p className="text-sm text-muted">Herkes, üyeler, arkadaşlar veya yalnızca sen. Tam adres varsayılan olarak yalnızca sende kalır. Akış varsayılan olarak üyelere açıktır.</p>
      {fields.map(([key, label]) => (
        <div key={key}>
          <Label htmlFor={key}>{label}</Label>
          <Select id={key} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value as Visibility })}>
            {VISIBILITIES.map((level) => <option key={level} value={level}>{VISIBILITY_LABELS[level]}</option>)}
          </Select>
        </div>
      ))}
      {message ? <p className="text-sm">{message}</p> : null}
      <Button type="submit" className="w-full">Kaydet</Button>
    </form>
  );
}
