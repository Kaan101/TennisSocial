"use client";

import { WEEKDAYS } from "@club/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/states";

type Availability = {
  weekly: { weekday: number; startTime: string; endTime: string; note: string | null }[];
  oneOff: { date: string | null; startTime: string; endTime: string; note: string | null }[];
};

export default function AvailabilityPage() {
  const { user } = useAuth();
  const { data, error, loading } = useResource<Availability>(user ? `/users/${user.id}/availability` : null);
  const [weekly, setWeekly] = useState<Record<number, { on: boolean; startTime: string; endTime: string }>>({});
  const [oneOff, setOneOff] = useState({ date: "", startTime: "19:00", endTime: "22:00", note: "" });
  const [extra, setExtra] = useState<Availability["oneOff"]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: Record<number, { on: boolean; startTime: string; endTime: string }> = {};
    for (const day of WEEKDAYS) {
      const found = data.weekly.find((item) => item.weekday === day.value);
      next[day.value] = { on: Boolean(found), startTime: found?.startTime ?? "18:00", endTime: found?.endTime ?? "21:00" };
    }
    setWeekly(next);
    setExtra(data.oneOff);
  }, [data]);

  if (loading || !user) return <LoadingBlock />;
  if (error) return <ErrorState message={error} />;

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await api(`/users/${user.id}/availability`, {
            method: "PUT",
            body: JSON.stringify({
              weekly: WEEKDAYS.filter((day) => weekly[day.value]?.on).map((day) => ({
                weekday: day.value,
                startTime: weekly[day.value]!.startTime,
                endTime: weekly[day.value]!.endTime,
              })),
              oneOff: extra.filter((item) => item.date).map((item) => ({
                date: item.date,
                startTime: item.startTime,
                endTime: item.endTime,
                note: item.note,
              })),
            }),
          });
          setMessage("Müsaitlik kaydedildi.");
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Kaydedilemedi");
        }
      }}
    >
      <PageHeader title="Müsaitlik" />
      {WEEKDAYS.map((day) => (
        <div key={day.value} className="rounded-3xl bg-surface p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={weekly[day.value]?.on ?? false}
              onChange={(event) => setWeekly({ ...weekly, [day.value]: { ...(weekly[day.value] ?? { startTime: "18:00", endTime: "21:00" }), on: event.target.checked } })}
            />
            {day.label}
          </label>
          {weekly[day.value]?.on ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input aria-label={`${day.label} başlangıç`} type="time" value={weekly[day.value]?.startTime} onChange={(e) => setWeekly({ ...weekly, [day.value]: { ...weekly[day.value]!, startTime: e.target.value } })} />
              <Input aria-label={`${day.label} bitiş`} type="time" value={weekly[day.value]?.endTime} onChange={(e) => setWeekly({ ...weekly, [day.value]: { ...weekly[day.value]!, endTime: e.target.value } })} />
            </div>
          ) : null}
        </div>
      ))}
      <div className="rounded-3xl bg-surface p-3 space-y-2">
        <p className="font-semibold">Tek seferlik</p>
        <Label htmlFor="once-date">Tarih</Label>
        <Input id="once-date" type="date" value={oneOff.date} onChange={(e) => setOneOff({ ...oneOff, date: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label="Başlangıç" type="time" value={oneOff.startTime} onChange={(e) => setOneOff({ ...oneOff, startTime: e.target.value })} />
          <Input aria-label="Bitiş" type="time" value={oneOff.endTime} onChange={(e) => setOneOff({ ...oneOff, endTime: e.target.value })} />
        </div>
        <Input aria-label="Not" placeholder="bugün 19:00 sonrası" value={oneOff.note} onChange={(e) => setOneOff({ ...oneOff, note: e.target.value })} />
        <Button type="button" variant="outline" onClick={() => {
          if (!oneOff.date) return;
          setExtra([...extra, oneOff]);
          setOneOff({ date: "", startTime: "19:00", endTime: "22:00", note: "" });
        }}>Ekle</Button>
        <ul className="text-sm text-muted">
          {extra.map((item, index) => <li key={`${item.date}-${index}`}>{item.date} {item.startTime}-{item.endTime} {item.note}</li>)}
        </ul>
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
      <Button type="submit" className="w-full">Kaydet</Button>
    </form>
  );
}
