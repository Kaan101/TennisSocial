"use client";

import {
  LEVEL_LABELS,
  OVERALL_LEVELS,
  SET_FORMAT_LABELS,
  SET_FORMATS,
  TOURNAMENT_DIVISION_LABELS,
  TOURNAMENT_DIVISIONS,
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_FORMATS,
  TOURNAMENT_STATUSES,
  TOURNAMENT_STATUS_LABELS,
} from "@club/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";

export type TournamentFormValues = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  status: string;
  format: string;
  division: string;
  location: string;
  maxPlayers: string;
  minLevel: string;
  maxLevel: string;
  courts: string;
  setFormat: string;
  rules: string;
  pointsWin: string;
  pointsLoss: string;
  groupSize: string;
  qualifiersPerGroup: string;
};

export const emptyTournamentForm: TournamentFormValues = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  registrationDeadline: "",
  status: "REGISTRATION_OPEN",
  format: "SINGLE_ELIMINATION",
  division: "SINGLES",
  location: "",
  maxPlayers: "",
  minLevel: "",
  maxLevel: "",
  courts: "",
  setFormat: "BEST_OF_3",
  rules: "",
  pointsWin: "3",
  pointsLoss: "0",
  groupSize: "4",
  qualifiersPerGroup: "2",
};

export function TournamentForm({
  initial,
  submitLabel,
  onDone,
  endpoint,
  method,
}: {
  initial: TournamentFormValues;
  submitLabel: string;
  endpoint: string;
  method: "POST" | "PATCH";
  onDone: (id?: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const form = new FormData(event.currentTarget);
        const courts = String(form.get("courts") ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        const maxPlayers = String(form.get("maxPlayers") ?? "").trim();
        const payload = {
          name: form.get("name"),
          description: String(form.get("description") ?? "") || null,
          startDate: form.get("startDate"),
          endDate: String(form.get("endDate") ?? "") || null,
          registrationDeadline: String(form.get("registrationDeadline") ?? "") || null,
          status: form.get("status"),
          format: form.get("format"),
          division: form.get("division"),
          location: String(form.get("location") ?? "") || null,
          maxPlayers: maxPlayers ? Number(maxPlayers) : null,
          minLevel: String(form.get("minLevel") ?? "") || null,
          maxLevel: String(form.get("maxLevel") ?? "") || null,
          courts,
          setFormat: form.get("setFormat"),
          rules: String(form.get("rules") ?? "") || null,
          pointsWin: Number(form.get("pointsWin") ?? 3),
          pointsLoss: Number(form.get("pointsLoss") ?? 0),
          groupSize: Number(form.get("groupSize") ?? 4),
          qualifiersPerGroup: Number(form.get("qualifiersPerGroup") ?? 2),
        };
        try {
          const saved = await api<{ id: string }>(endpoint, { method, body: JSON.stringify(payload) });
          onDone(saved.id);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Kaydedilemedi");
        } finally {
          setPending(false);
        }
      }}
    >
      <div><Label htmlFor="name">Ad</Label><Input id="name" name="name" required defaultValue={initial.name} /></div>
      <div><Label htmlFor="description">Açıklama</Label><Textarea id="description" name="description" defaultValue={initial.description} /></div>
      <div><Label htmlFor="startDate">Başlangıç</Label><Input id="startDate" name="startDate" type="date" required defaultValue={initial.startDate} /></div>
      <div><Label htmlFor="endDate">Bitiş</Label><Input id="endDate" name="endDate" type="date" defaultValue={initial.endDate} /></div>
      <div><Label htmlFor="registrationDeadline">Kayıt son günü</Label><Input id="registrationDeadline" name="registrationDeadline" type="date" defaultValue={initial.registrationDeadline} /></div>
      <div>
        <Label htmlFor="status">Durum</Label>
        <Select id="status" name="status" defaultValue={initial.status}>
          {TOURNAMENT_STATUSES.map((item) => <option key={item} value={item}>{TOURNAMENT_STATUS_LABELS[item]}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="format">Format</Label>
        <Select id="format" name="format" defaultValue={initial.format}>
          {TOURNAMENT_FORMATS.map((item) => <option key={item} value={item}>{TOURNAMENT_FORMAT_LABELS[item]}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="division">Kategori</Label>
        <Select id="division" name="division" defaultValue={initial.division}>
          {TOURNAMENT_DIVISIONS.map((item) => <option key={item} value={item}>{TOURNAMENT_DIVISION_LABELS[item]}</option>)}
        </Select>
      </div>
      <div><Label htmlFor="location">Yer</Label><Input id="location" name="location" defaultValue={initial.location} /></div>
      <div><Label htmlFor="maxPlayers">En fazla oyuncu</Label><Input id="maxPlayers" name="maxPlayers" inputMode="numeric" defaultValue={initial.maxPlayers} /></div>
      <div>
        <Label htmlFor="minLevel">Alt seviye</Label>
        <Select id="minLevel" name="minLevel" defaultValue={initial.minLevel}>
          <option value="">Sınır yok</option>
          {OVERALL_LEVELS.map((item) => <option key={item} value={item}>{LEVEL_LABELS[item]}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="maxLevel">Üst seviye</Label>
        <Select id="maxLevel" name="maxLevel" defaultValue={initial.maxLevel}>
          <option value="">Sınır yok</option>
          {OVERALL_LEVELS.map((item) => <option key={item} value={item}>{LEVEL_LABELS[item]}</option>)}
        </Select>
      </div>
      <div><Label htmlFor="courts">Kortlar</Label><Input id="courts" name="courts" placeholder="Kort 1, Kort 2" defaultValue={initial.courts} /></div>
      <div>
        <Label htmlFor="setFormat">Set</Label>
        <Select id="setFormat" name="setFormat" defaultValue={initial.setFormat}>
          {SET_FORMATS.map((item) => <option key={item} value={item}>{SET_FORMAT_LABELS[item]}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="pointsWin">Galibiyet puanı</Label><Input id="pointsWin" name="pointsWin" inputMode="numeric" defaultValue={initial.pointsWin} /></div>
        <div><Label htmlFor="pointsLoss">Mağlubiyet puanı</Label><Input id="pointsLoss" name="pointsLoss" inputMode="numeric" defaultValue={initial.pointsLoss} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="groupSize">Grup büyüklüğü</Label><Input id="groupSize" name="groupSize" inputMode="numeric" defaultValue={initial.groupSize} /></div>
        <div><Label htmlFor="qualifiersPerGroup">Gruptan çıkan</Label><Input id="qualifiersPerGroup" name="qualifiersPerGroup" inputMode="numeric" defaultValue={initial.qualifiersPerGroup} /></div>
      </div>
      <div><Label htmlFor="rules">Kurallar</Label><Textarea id="rules" name="rules" defaultValue={initial.rules} /></div>
      {error ? <p className="text-sm text-clay" role="alert">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Kaydediliyor…" : submitLabel}</Button>
    </form>
  );
}
