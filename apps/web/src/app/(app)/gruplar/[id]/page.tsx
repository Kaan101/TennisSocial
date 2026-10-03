"use client";

import {
  AGE_GROUPS,
  AGE_GROUP_LABELS,
  PERSON_PROFILE_LABELS,
  TENNIS_TYPES,
  TENNIS_TYPE_LABELS,
  type AgeGroup,
  type PersonProfile,
  type TennisType,
} from "@club/shared";
import type { PlayerCard as Card } from "@club/types";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

type Member = {
  userId: string;
  role: string;
  name: string;
  tennisType: TennisType;
  ageGroup: AgeGroup;
  personProfile: PersonProfile;
};

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  tennisType: TennisType;
  ageGroup: AgeGroup;
  joined: boolean;
  managed: boolean;
  members: Member[];
  events: { id: string; title: string; startsAt: string; location: string | null }[];
  matches: { id: string; scheduledAt: string; status: string; players: { name: string }[] }[];
  tournaments: { id: string; name: string; status: string; startDate: string }[];
};

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useResource<GroupDetail>(`/groups/${params.id}`);
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [tennisType, setTennisType] = useState<TennisType | null>(null);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Card[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "Grup açılmadı"} onRetry={reload} />;

  const group = data;
  const memberIds = new Set(group.members.map((member) => member.userId));
  const draftTitle = title ?? group.name;
  const draftType = tennisType ?? group.tennisType;
  const draftAge = ageGroup ?? group.ageGroup;

  async function saveGroup(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api(`/groups/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: draftTitle, tennisType: draftType, ageGroup: draftAge }),
      });
      setTitle(null);
      setTennisType(null);
      setAgeGroup(null);
      setMessage("Grup güncellendi.");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Grup kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function removeGroup() {
    if (!window.confirm("Bu grup silinsin mi?")) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/groups/${group.id}`, { method: "DELETE" });
      router.push("/gruplar");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Grup silinemedi");
      setBusy(false);
    }
  }

  async function searchPlayers(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const result = await api<{ data: Card[] }>(`/players/search?q=${encodeURIComponent(query)}&pageSize=8`);
      setFound(result.data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Oyuncular aranamadı");
    }
  }

  async function addPlayer(player: Card) {
    setMessage(null);
    try {
      await api(`/groups/${group.id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: player.id, role: "MEMBER" }),
      });
      setMessage(`${player.firstName} ${player.lastName} eklendi.`);
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Oyuncu eklenemedi");
    }
  }

  async function removePlayer(userId: string) {
    setMessage(null);
    try {
      await api(`/groups/${group.id}/members/${userId}`, { method: "DELETE" });
      setMessage("Oyuncu gruptan çıkarıldı.");
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Oyuncu çıkarılamadı");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{data.name}</h1>
        <p className="text-sm text-muted">{TENNIS_TYPE_LABELS[data.tennisType]} · {AGE_GROUP_LABELS[data.ageGroup]}</p>
        <p className="text-sm text-muted">{data.description}</p>
      </div>
      {data.managed ? (
        <form onSubmit={saveGroup} className="space-y-3 rounded-3xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Grubu düzenle</h2>
          <div>
            <Label htmlFor="group-title">Ad</Label>
            <Input id="group-title" value={draftTitle} onChange={(event) => setTitle(event.target.value)} required minLength={2} />
          </div>
          <div>
            <Label htmlFor="group-type">Tür</Label>
            <Select id="group-type" value={draftType} onChange={(event) => setTennisType(event.target.value as TennisType)} required>
              {TENNIS_TYPES.map((type) => <option key={type} value={type}>{TENNIS_TYPE_LABELS[type]}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="group-age">Yaş grubu</Label>
            <Select id="group-age" value={draftAge} onChange={(event) => setAgeGroup(event.target.value as AgeGroup)} required>
              {AGE_GROUPS.map((band) => <option key={band} value={band}>{AGE_GROUP_LABELS[band]}</option>)}
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>Kaydet</Button>
          <Button type="button" variant="clay" className="w-full" disabled={busy} onClick={() => void removeGroup()}>Grubu sil</Button>
        </form>
      ) : null}
      {!data.joined && data.visibility === "PUBLIC" ? (
        <Button
          onClick={async () => {
            try {
              await api(`/groups/${data.id}/join`, { method: "POST" });
              setMessage("Gruba katıldın.");
              await reload();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Katılınamadı");
            }
          }}
        >
          Katıl
        </Button>
      ) : null}
      {message ? <p className="text-sm">{message}</p> : null}
      <section className="space-y-3">
        <h2 className="font-semibold">Üyeler</h2>
        <ul className="space-y-2">
          {data.members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{member.name}</span>
                {member.role === "MANAGER" ? " · sorumlu" : ""}
                <span className="block text-xs text-muted">
                  {TENNIS_TYPE_LABELS[member.tennisType]} · {AGE_GROUP_LABELS[member.ageGroup]} · {PERSON_PROFILE_LABELS[member.personProfile]}
                </span>
              </span>
              {data.managed ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void removePlayer(member.userId)}>Çıkar</Button>
              ) : null}
            </li>
          ))}
        </ul>
        {data.managed ? (
          <form onSubmit={searchPlayers} className="space-y-2 rounded-3xl border border-line bg-surface p-4">
            <h3 className="font-semibold">Oyuncu ekle</h3>
            <p className="text-xs text-muted">Farklı türde olsa da, başka bir grupta olsa da eklenebilir.</p>
            <div className="flex gap-2">
              <Input id="player-query" aria-label="Oyuncu ara" placeholder="Oyuncu adı" value={query} onChange={(event) => setQuery(event.target.value)} />
              <Button type="submit" variant="outline">Ara</Button>
            </div>
            {found && found.length === 0 ? <p className="text-sm text-muted">Bu aramada oyuncu yok.</p> : null}
            <ul className="space-y-2">
              {found?.map((player) => (
                <li key={player.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {player.firstName} {player.lastName}
                    <span className="block text-xs text-muted">
                      {TENNIS_TYPE_LABELS[player.tennisType]} · {AGE_GROUP_LABELS[player.ageGroup]} · {PERSON_PROFILE_LABELS[player.personProfile]}
                    </span>
                  </span>
                  {memberIds.has(player.id) ? (
                    <span className="text-xs font-semibold text-muted">Bu grupta</span>
                  ) : (
                    <Button type="button" size="sm" onClick={() => void addPlayer(player)}>Ekle</Button>
                  )}
                </li>
              ))}
            </ul>
          </form>
        ) : null}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Etkinlikler</h2>
        {data.events.length === 0 ? <EmptyState title="Etkinlik yok" body="Grup sorumlusu bir buluşma ekleyebilir." /> : data.events.map((event) => (
          <p key={event.id} className="rounded-2xl bg-surface p-3 text-sm">{event.title} · {new Date(event.startsAt).toLocaleString("tr-TR")}</p>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Maçlar</h2>
        {data.matches.length === 0 ? <EmptyState title="Maç yok" body="Bu grubun maçı henüz yok." /> : data.matches.map((match) => (
          <p key={match.id} className="rounded-2xl bg-surface p-3 text-sm">{match.players.map((player) => player.name).join(" · ")}</p>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Turnuvalar</h2>
        {data.tournaments.length === 0 ? <EmptyState title="Turnuva yok" body="Bağlı turnuva olduğunda burada görünür." /> : data.tournaments.map((item) => (
          <p key={item.id} className="rounded-2xl bg-surface p-3 text-sm">{item.name}</p>
        ))}
      </section>
    </div>
  );
}
