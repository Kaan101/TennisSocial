"use client";

import {
  AGE_GROUPS,
  AGE_GROUP_LABELS,
  PERSON_PROFILES,
  PERSON_PROFILE_LABELS,
  TENNIS_TYPES,
  TENNIS_TYPE_LABELS,
  telLink,
  waLink,
  type AgeGroup,
  type PersonProfile,
  type TennisType,
} from "@club/shared";
import type { UserDetail } from "@club/types";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MatchStats } from "@/components/match-stats";
import { Avatar } from "@/components/player-card";
import { SkillRadar } from "@/components/radar";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";
import { useState } from "react";

export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, error, loading, reload } = useResource<UserDetail>(`/users/${params.id}`);
  const [note, setNote] = useState<string | null>(null);
  const [tennisType, setTennisType] = useState<TennisType | null>(null);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [personProfile, setPersonProfile] = useState<PersonProfile | null>(null);
  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "Profil açılmadı"} onRetry={reload} />;
  const draftType = tennisType ?? data.profile.tennisType;
  const draftAge = ageGroup ?? data.profile.ageGroup;
  const draftPerson = personProfile ?? data.profile.personProfile;
  const name = `${data.profile.firstName} ${data.profile.lastName}`.trim();
  const whatsappHref =
    data.permissions.canWhatsapp && data.profile.whatsapp
      ? waLink(data.profile.whatsapp, data.profile.firstName)
      : null;
  const callHref = data.permissions.canCall && data.profile.phone ? telLink(data.profile.phone) : null;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar first={data.profile.firstName} last={data.profile.lastName} photo={data.profile.photoUrl} className="h-16 w-16 text-lg" />
        <div>
          <h1 className="text-2xl font-semibold">{name}</h1>
          <p className="text-sm text-muted">
            {TENNIS_TYPE_LABELS[data.profile.tennisType]} · {AGE_GROUP_LABELS[data.profile.ageGroup]} · {PERSON_PROFILE_LABELS[data.profile.personProfile]}
          </p>
          <p className="text-sm text-muted">{data.profile.statusMessage}</p>
          <p className="text-sm text-muted">{[data.profile.district, data.profile.city].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {data.profile.statusNote ? <p className="rounded-2xl bg-surface px-4 py-3 text-sm">{data.profile.statusNote}</p> : null}
      {data.profile.bio ? <p className="text-sm leading-6">{data.profile.bio}</p> : null}
      <div className="flex flex-wrap gap-2">
        {data.permissions.canChallenge ? (
          <Link href={`/defiler/yeni?recipientId=${data.id}`} className="rounded-full bg-court px-4 py-2 text-sm font-semibold text-white">Defi</Link>
        ) : null}
        {whatsappHref ? (
          <a className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold" href={whatsappHref}>WhatsApp</a>
        ) : null}
        {callHref ? (
          <a className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold" href={callHref}>Ara</a>
        ) : null}
        {user && user.id !== data.id ? (
          <Link href={`/karsilastir?b=${data.id}`} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold">Karşılaştır</Link>
        ) : null}
        {user && user.id !== data.id ? (
          <button
            type="button"
            className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold"
            onClick={async () => {
              try {
                await api("/friends", { method: "POST", body: JSON.stringify({ userId: data.id }) });
                setNote("Arkadaşlık isteği gönderildi.");
              } catch (err) {
                setNote(err instanceof Error ? err.message : "İstek gönderilemedi");
              }
            }}
          >
            Arkadaş ekle
          </button>
        ) : null}
      </div>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
      {data.permissions.canEdit ? (
        <form
          className="space-y-3 rounded-3xl border border-line bg-surface p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setNote(null);
            try {
              await api(`/users/${data.id}`, {
                method: "PATCH",
                body: JSON.stringify({ tennisType: draftType, ageGroup: draftAge, personProfile: draftPerson }),
              });
              setTennisType(null);
              setAgeGroup(null);
              setPersonProfile(null);
              setNote("Oyuncu kaydı güncellendi.");
              await reload();
            } catch (err) {
              setNote(err instanceof Error ? err.message : "Kaydedilemedi");
            }
          }}
        >
          <h2 className="font-semibold">Tür ve profil</h2>
          <div>
            <Label htmlFor="player-type">Tür</Label>
            <Select id="player-type" value={draftType} onChange={(event) => setTennisType(event.target.value as TennisType)}>
              {TENNIS_TYPES.map((type) => <option key={type} value={type}>{TENNIS_TYPE_LABELS[type]}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="player-age">Yaş grubu</Label>
            <Select id="player-age" value={draftAge} onChange={(event) => setAgeGroup(event.target.value as AgeGroup)}>
              {AGE_GROUPS.map((band) => <option key={band} value={band}>{AGE_GROUP_LABELS[band]}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="player-person">Kişi profili</Label>
            <Select id="player-person" value={draftPerson} onChange={(event) => setPersonProfile(event.target.value as PersonProfile)}>
              {PERSON_PROFILES.map((kind) => <option key={kind} value={kind}>{PERSON_PROFILE_LABELS[kind]}</option>)}
            </Select>
          </div>
          <Button type="submit" className="w-full">Kaydet</Button>
        </form>
      ) : null}
      <section className="rounded-3xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Tenis</h2>
        {data.tennis ? (
          <>
            <p className="mt-1 text-sm text-muted">
              {data.tennis.overallLabel}
              {data.tennis.ntrp ? ` · NTRP ${data.tennis.ntrp}` : ""} · {data.tennis.playPreferenceLabel}
              {data.tennis.backhandType ? ` · ${data.tennis.backhandType} backhand` : ""}
            </p>
            <SkillRadar series={[{ name, color: "#0f6e49", data: data.tennis.radar }]} />
          </>
        ) : (
          <EmptyState title="Tenis profili gizli" body="Bu üye vuruş bilgilerini paylaşmıyor." />
        )}
      </section>
      {data.rackets[0] ? (
        <section className="rounded-3xl border border-line bg-surface p-4 text-sm">
          <h2 className="font-semibold">Raket</h2>
          <p className="mt-1">{data.rackets[0].brand} {data.rackets[0].model}</p>
          <p className="text-muted">{[data.rackets[0].headSize, data.rackets[0].weight, data.rackets[0].stringName, data.rackets[0].tension].filter(Boolean).join(" · ")}</p>
        </section>
      ) : null}
      {data.stats ? <MatchStats stats={data.stats} /> : <p className="text-sm text-muted">Maç geçmişi gizli.</p>}
    </div>
  );
}
