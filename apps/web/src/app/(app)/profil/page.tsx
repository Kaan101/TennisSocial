"use client";

import { PLAYER_STATUSES, STATUS_LABELS } from "@club/shared";
import type { UserDetail } from "@club/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MatchStats } from "@/components/match-stats";
import { Avatar } from "@/components/player-card";
import { SkillRadar } from "@/components/radar";
import { ErrorState, LoadingBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, error, loading, reload } = useResource<UserDetail>(user ? `/users/${user.id}` : null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setForm({
      firstName: data.profile.firstName,
      lastName: data.profile.lastName,
      phone: data.profile.phone ?? "",
      whatsapp: data.profile.whatsapp ?? "",
      district: data.profile.district ?? "",
      city: data.profile.city ?? "",
      address: data.profile.address ?? "",
      bio: data.profile.bio ?? "",
      birthYear: data.profile.birthYear ? String(data.profile.birthYear) : "",
      playerStatus: data.profile.playerStatus,
      statusNote: data.profile.statusNote ?? "",
      statusEnd: data.profile.statusEnd ?? "",
    });
  }, [data]);

  if (!user || loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "Profil açılmadı"} onRetry={reload} />;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await api(`/users/${user!.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          birthYear: form.birthYear ? Number(form.birthYear) : null,
          phone: form.phone || null,
          whatsapp: form.whatsapp || null,
          address: form.address || null,
          district: form.district || null,
          city: form.city || null,
          bio: form.bio || null,
          statusNote: form.statusNote || null,
          statusEnd: form.statusEnd || null,
        }),
      });
      setMessage("Profil güncellendi.");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Kaydedilemedi");
    }
  }

  async function upload(file: File) {
    const body = new FormData();
    body.set("file", file);
    await api(`/users/${user!.id}/photo`, { method: "POST", body });
    await reload();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar first={data.profile.firstName} last={data.profile.lastName} photo={data.profile.photoUrl} className="h-16 w-16" />
        <div>
          <h1 className="text-2xl font-semibold">{data.profile.firstName}</h1>
          <p className="text-sm text-muted">{data.profile.statusMessage}</p>
        </div>
      </div>
      <label className="text-sm font-semibold text-court">
        Fotoğraf yükle
        <input className="mt-1 block text-ink" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }} />
      </label>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <Link href="/profil/tenis" className="rounded-2xl bg-surface p-3 font-semibold">Tenis</Link>
        <Link href="/profil/musaitlik" className="rounded-2xl bg-surface p-3 font-semibold">Müsaitlik</Link>
        <Link href="/profil/gizlilik" className="rounded-2xl bg-surface p-3 font-semibold">Gizlilik</Link>
        <Link href="/gruplar" className="rounded-2xl bg-surface p-3 font-semibold">Gruplar</Link>
        <Link href="/merdiven" className="rounded-2xl bg-surface p-3 font-semibold">Merdiven</Link>
        <Link href="/duyurular" className="rounded-2xl bg-surface p-3 font-semibold">Duyurular</Link>
        {user.role === "ADMIN" || user.role === "CLUB_MANAGER" ? (
          <Link href="/analiz" className="rounded-2xl bg-surface p-3 font-semibold">Kulüp özeti</Link>
        ) : null}
      </div>
      {data.tennis ? <div className="rounded-3xl bg-surface p-2"><SkillRadar series={[{ name: data.profile.firstName, color: "#0f6e49", data: data.tennis.radar }]} /></div> : null}
      {data.stats ? <MatchStats stats={data.stats} /> : null}
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="firstName">Ad</Label><Input id="firstName" value={form.firstName ?? ""} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
          <div><Label htmlFor="lastName">Soyad</Label><Input id="lastName" value={form.lastName ?? ""} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
        </div>
        <div><Label htmlFor="birthYear">Doğum yılı</Label><Input id="birthYear" inputMode="numeric" value={form.birthYear ?? ""} onChange={(e) => setForm({ ...form, birthYear: e.target.value })} /></div>
        <div><Label htmlFor="phone">Telefon</Label><Input id="phone" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><Label htmlFor="whatsapp">WhatsApp</Label><Input id="whatsapp" value={form.whatsapp ?? ""} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor="district">Semt</Label><Input id="district" value={form.district ?? ""} onChange={(e) => setForm({ ...form, district: e.target.value })} /></div>
          <div><Label htmlFor="city">Şehir</Label><Input id="city" value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        </div>
        <div><Label htmlFor="address">Adres</Label><Input id="address" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /><p className="mt-1 text-xs text-muted">Tam adres varsayılan olarak gizli. Diğerleri semt ve şehri görür.</p></div>
        <div><Label htmlFor="bio">Kısa not</Label><Textarea id="bio" value={form.bio ?? ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
        <div>
          <Label htmlFor="playerStatus">Durum</Label>
          <Select id="playerStatus" value={form.playerStatus ?? "ACTIVE"} onChange={(e) => setForm({ ...form, playerStatus: e.target.value })}>
            {PLAYER_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="statusEnd">Durum bitiş tarihi</Label>
          <Input id="statusEnd" type="date" value={form.statusEnd ?? ""} onChange={(e) => setForm({ ...form, statusEnd: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="statusNote">Herkese açık not</Label>
          <Textarea id="statusNote" value={form.statusNote ?? ""} onChange={(e) => setForm({ ...form, statusNote: e.target.value })} />
          <p className="mt-1 text-xs text-muted">Tanı veya tıbbi ayrıntı yazma. İstersen kısa bir not bırak.</p>
        </div>
        {message ? <p className="text-sm">{message}</p> : null}
        <Button type="submit" className="w-full">Kaydet</Button>
      </form>
      <button
        type="button"
        className="text-sm font-semibold text-clay"
        onClick={async () => {
          await fetch("/api/session/logout", { method: "POST" });
          router.replace("/login");
        }}
      >
        Çıkış yap
      </button>
    </div>
  );
}
