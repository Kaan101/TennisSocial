"use client";

import {
  BACKHAND_LABELS,
  BACKHAND_TYPES,
  COURT_LABELS,
  COURT_TYPES,
  HAND_LABELS,
  DOMINANT_HANDS,
  LEVEL_LABELS,
  OVERALL_LEVELS,
  PLAY_LABELS,
  PLAY_PREFERENCES,
  PREFERRED_TIMES,
  SKILL_GROUPS,
  SKILL_LABELS,
  TIME_LABELS,
  type SkillName,
} from "@club/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/states";

type Tennis = {
  tennisStartYear: number | null;
  dominantHand: string | null;
  backhandType: string | null;
  preferredCourt: string | null;
  playPreference: string;
  preferredPlayTimes: string[];
  overallLevel: string;
  ntrp: number | null;
  skills: { skill: SkillName; value: number }[];
};

export default function TennisPage() {
  const { user } = useAuth();
  const { data, error, loading } = useResource<Tennis>(user ? `/users/${user.id}/tennis-profile` : null);
  const [draft, setDraft] = useState<Tennis | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const form = draft ?? data;
  if (loading || !user) return <LoadingBlock />;
  if (error || !form) return <ErrorState message={error ?? "Tenis profili açılmadı"} />;

  function update(partial: Partial<Tennis>) {
    setDraft({ ...form!, ...partial });
  }

  const skillValue = (skill: SkillName) => form.skills.find((item) => item.skill === skill)?.value ?? 5;

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const skills = SKILL_GROUPS.flatMap((group) => group.skills).map((skill) => ({ skill, value: skillValue(skill) }));
        try {
          await api(`/users/${user.id}/tennis-profile`, {
            method: "PUT",
            body: JSON.stringify({ ...form, skills, ntrp: form.ntrp }),
          });
          setMessage("Tenis profilin kaydedildi.");
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Kaydedilemedi");
        }
      }}
    >
      <PageHeader title="Tenis profili" />
      <div>
        <Label htmlFor="level">Genel seviye</Label>
        <Select id="level" value={form.overallLevel} onChange={(e) => update({ overallLevel: e.target.value })}>
          {OVERALL_LEVELS.map((level) => <option key={level} value={level}>{LEVEL_LABELS[level]}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="ntrp">NTRP (isteğe bağlı)</Label>
        <Input id="ntrp" inputMode="decimal" value={form.ntrp ?? ""} onChange={(e) => update({ ntrp: e.target.value ? Number(e.target.value) : null })} />
      </div>
      <div>
        <Label htmlFor="hand">Dominant el</Label>
        <Select id="hand" value={form.dominantHand ?? ""} onChange={(e) => update({ dominantHand: e.target.value || null })}>
          <option value="">Seç</option>
          {DOMINANT_HANDS.map((hand) => <option key={hand} value={hand}>{HAND_LABELS[hand]}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="backhand">Backhand</Label>
        <Select id="backhand" value={form.backhandType ?? ""} onChange={(e) => update({ backhandType: e.target.value || null })}>
          <option value="">Seç</option>
          {BACKHAND_TYPES.map((item) => <option key={item} value={item}>{BACKHAND_LABELS[item]}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="court">Kort</Label>
        <Select id="court" value={form.preferredCourt ?? ""} onChange={(e) => update({ preferredCourt: e.target.value || null })}>
          <option value="">Seç</option>
          {COURT_TYPES.map((item) => <option key={item} value={item}>{COURT_LABELS[item]}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="play">Tekler / çiftler</Label>
        <Select id="play" value={form.playPreference} onChange={(e) => update({ playPreference: e.target.value })}>
          {PLAY_PREFERENCES.map((item) => <option key={item} value={item}>{PLAY_LABELS[item]}</option>)}
        </Select>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Tercih edilen saatler</legend>
        <div className="flex flex-wrap gap-2">
          {PREFERRED_TIMES.map((time) => {
            const on = form.preferredPlayTimes.includes(time);
            return (
              <button
                key={time}
                type="button"
                onClick={() => update({ preferredPlayTimes: on ? form.preferredPlayTimes.filter((item) => item !== time) : [...form.preferredPlayTimes, time] })}
                className={`rounded-full px-3 py-1 text-sm ${on ? "bg-court text-white" : "bg-surface border border-line"}`}
              >
                {TIME_LABELS[time]}
              </button>
            );
          })}
        </div>
      </fieldset>
      {SKILL_GROUPS.map((group) => (
        <fieldset key={group.title} className="space-y-3 rounded-3xl bg-surface p-4">
          <legend className="font-semibold">{group.title}</legend>
          {group.skills.map((skill) => (
            <label key={skill} className="block text-sm">
              <span className="flex justify-between"><span>{SKILL_LABELS[skill]}</span><span>{skillValue(skill).toFixed(1)}</span></span>
              <input
                className="mt-1 w-full accent-court"
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={skillValue(skill)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  const skills = SKILL_GROUPS.flatMap((item) => item.skills).map((name) => ({
                    skill: name,
                    value: name === skill ? value : skillValue(name),
                  }));
                  update({ skills });
                }}
              />
            </label>
          ))}
        </fieldset>
      ))}
      {message ? <p className="text-sm">{message}</p> : null}
      <Button type="submit" className="w-full">Kaydet</Button>
    </form>
  );
}
