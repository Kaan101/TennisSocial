"use client";

import { COURT_PURPOSE_LABELS, WEEKDAYS, purposesForRole, type CourtPurpose, type Role } from "@club/shared";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/states";

export type Person = { id: string; firstName: string; lastName: string };
export type SlotPerson = Person & { overallLevel: string; levelLabel: string };
export type ReservationInfo = {
  id: string;
  purpose: CourtPurpose;
  purposeLabel: string;
  checkedIn: boolean;
  canCheckIn: boolean;
  checkInHint: string | null;
  players: Person[] | null;
};
export type CourtCell = {
  id: string;
  name: string;
  kind: "BALLOON" | "OUTDOOR";
  kindLabel: string;
  state: "free" | "reserved";
  reservation: ReservationInfo | null;
};
export type Slot = {
  date: string;
  weekday: number;
  startTime: string;
  endTime: string;
  green: boolean;
  people: SlotPerson[];
  courts: CourtCell[];
};
export type CourtRow = {
  id: string;
  name: string;
  active: boolean;
  kind: "BALLOON" | "OUTDOOR";
  kindLabel: string;
  sortOrder: number;
};
export type Reservation = {
  id: string;
  courtId: string;
  courtName: string;
  purpose: CourtPurpose;
  purposeLabel: string;
  status: string;
  startDate: string;
  endDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  holder: Person;
  partner: Person | null;
};

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function addHour(time: string): string {
  return `${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}:00`;
}

export function endOptions(start: string): string[] {
  const startHour = Number(start.slice(0, 2));
  const options: string[] = [];
  for (let hour = startHour + 1; hour <= 23; hour += 1) {
    options.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return options;
}

export function fullName(person: Person): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

export function courtWeekHref(courtId: string, weekStart: string, date: string, hour: string): string {
  return `/kortlar/${courtId}?week=${weekStart}&date=${date}&hour=${hour}`;
}

export function takvimHref(date: string, hour: string): string {
  return `/takvim?date=${date}&start=${hour}`;
}

export function kindClass(kind: "BALLOON" | "OUTDOOR"): string {
  return kind === "BALLOON"
    ? "rounded-full bg-court-deep/10 px-2 py-0.5 text-[11px] font-semibold text-court-deep"
    : "rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-muted";
}

export function PendingQueue({
  items,
  canApprove,
  busy,
  onApprove,
  onReject,
}: {
  items: Reservation[];
  canApprove: boolean;
  busy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{canApprove ? "Onay bekleyen talepler" : "Bekleyen taleplerin"}</h2>
      {items.length === 0 ? <EmptyState title="Bekleyen talep yok" body="Yeni bir kort talebi açıldığında burada durur." /> : null}
      {items.map((item) => (
        <article key={item.id} className="rounded-3xl border border-line bg-surface p-4 text-sm">
          <p className="font-semibold">
            <Link href={`/kortlar/${item.courtId}`} className="underline-offset-2 hover:underline">{item.courtName}</Link>
            {" · "}{item.purposeLabel}
          </p>
          <p className="text-muted">{item.startDate} – {item.endDate} · {item.startTime}–{item.endTime}</p>
          <p>{fullName(item.holder)}{item.partner ? ` ve ${fullName(item.partner)}` : ""}</p>
          {canApprove ? (
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={() => onApprove(item.id)}>Onayla</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onReject(item.id)}>Reddet</Button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

export function RequestForm({
  courts,
  role,
  hours,
  people,
  busy,
  onSubmit,
}: {
  courts: CourtRow[];
  role: Role;
  hours: string[];
  people: Person[];
  busy: boolean;
  onSubmit: (body: Record<string, unknown>, approved: boolean) => void;
}) {
  const purposes = purposesForRole(role);
  const [mode, setMode] = useState<"slot" | "range">("slot");
  const [courtId, setCourtId] = useState("");
  const [purpose, setPurpose] = useState<CourtPurpose>(purposes[0] ?? "TRAINING");
  const [date, setDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [startTime, setStartTime] = useState(hours[10] ?? "18:00");
  const [endTime, setEndTime] = useState("19:00");
  const [partnerId, setPartnerId] = useState("");
  const chosenPurpose = purposes.includes(purpose) ? purpose : purposes[0] ?? "TRAINING";
  const activeCourts = courts.filter((court) => court.active);

  return (
    <form
      className="space-y-3 rounded-3xl border border-line bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!courtId) return;
        const partner = chosenPurpose === "MATCH" ? partnerId : null;
        if (mode === "slot") {
          if (!date) return;
          onSubmit({
            courtId,
            purpose: chosenPurpose,
            startDate: date,
            endDate: date,
            weekdays: [weekdayOf(date)],
            startTime,
            endTime: addHour(startTime),
            partnerId: partner,
          }, role === "ADMIN");
          return;
        }
        onSubmit({
          courtId,
          purpose: chosenPurpose,
          startDate,
          endDate,
          weekdays,
          startTime,
          endTime,
          partnerId: partner,
        }, role === "ADMIN");
      }}
    >
      <h2 className="font-semibold">Kort talebi</h2>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === "slot" ? "default" : "outline"} onClick={() => setMode("slot")}>Tek saat</Button>
        <Button type="button" size="sm" variant={mode === "range" ? "default" : "outline"} onClick={() => setMode("range")}>Dönem</Button>
      </div>
      <Label htmlFor="court">Kort</Label>
      <Select id="court" value={courtId} onChange={(event) => setCourtId(event.target.value)} required>
        <option value="">Kort seç</option>
        {activeCourts.map((court) => (
          <option key={court.id} value={court.id}>{court.name} · {court.kindLabel}</option>
        ))}
      </Select>
      <Label htmlFor="purpose">Amaç</Label>
      <Select id="purpose" value={chosenPurpose} onChange={(event) => setPurpose(event.target.value as CourtPurpose)}>
        {purposes.map((item) => <option key={item} value={item}>{COURT_PURPOSE_LABELS[item]}</option>)}
      </Select>
      {chosenPurpose === "MATCH" ? (
        <>
          <Label htmlFor="partner">Rakip</Label>
          <Select id="partner" value={partnerId} onChange={(event) => setPartnerId(event.target.value)} required>
            <option value="">Oyuncu seç</option>
            {people.map((person) => <option key={person.id} value={person.id}>{fullName(person)}</option>)}
          </Select>
        </>
      ) : null}
      {mode === "slot" ? (
        <>
          <Label htmlFor="slot-date">Tarih</Label>
          <Input id="slot-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          <Label htmlFor="slot-hour">Saat</Label>
          <Select id="slot-hour" value={startTime} onChange={(event) => setStartTime(event.target.value)}>
            {hours.map((hour) => <option key={hour} value={hour}>{hour}</option>)}
          </Select>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="range-start">Başlangıç</Label>
              <Input id="range-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
            </div>
            <div>
              <Label htmlFor="range-end">Bitiş</Label>
              <Input id="range-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const year = (startDate || new Date().toISOString().slice(0, 4)).slice(0, 4);
              setStartDate(`${year}-01-01`);
              setEndDate(`${year}-12-31`);
            }}
          >
            Bu yıl
          </Button>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Günler</legend>
            {WEEKDAYS.map((day) => (
              <label key={day.value} className="mr-3 inline-flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={weekdays.includes(day.value)}
                  onChange={(event) => {
                    setWeekdays(event.target.checked ? [...weekdays, day.value] : weekdays.filter((value) => value !== day.value));
                  }}
                />
                {day.short}
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="range-from">İlk saat</Label>
              <Select id="range-from" value={startTime} onChange={(event) => setStartTime(event.target.value)}>
                {hours.map((hour) => <option key={hour} value={hour}>{hour}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="range-to">Bitiş saati</Label>
              <Select id="range-to" value={endTime} onChange={(event) => setEndTime(event.target.value)}>
                {hours.map((hour) => <option key={`end-${hour}`} value={addHour(hour)}>{addHour(hour)}</option>)}
              </Select>
            </div>
          </div>
        </>
      )}
      <Button type="submit" disabled={busy || activeCourts.length === 0}>Talep gönder</Button>
    </form>
  );
}

export function AdminCourts({
  courts,
  lead,
  busy,
  onCreate,
  onToggle,
  onLead,
}: {
  courts: CourtRow[];
  lead: number;
  busy: boolean;
  onCreate: (name: string) => void;
  onToggle: (court: CourtRow) => void;
  onLead: (hours: number) => void;
}) {
  const [name, setName] = useState("");
  const [hours, setHours] = useState(String(lead));
  return (
    <section className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <h2 className="font-semibold">Kort yönetimi</h2>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          onCreate(name.trim());
          setName("");
        }}
      >
        <Input aria-label="Yeni kort adı" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ek kort" />
        <Button type="submit" disabled={busy}>Ekle</Button>
      </form>
      <ul className="space-y-2 text-sm">
        {courts.map((court) => (
          <li key={court.id} className="flex items-center justify-between gap-2">
            <span>{court.name} · {court.kindLabel}{court.active ? "" : " · pasif"}</span>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onToggle(court)}>{court.active ? "Kapat" : "Aç"}</Button>
          </li>
        ))}
      </ul>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onLead(Number(hours));
        }}
      >
        <div className="flex-1">
          <Label htmlFor="lead">Check-in ön süresi (saat)</Label>
          <Input id="lead" type="number" min={0} max={72} value={hours} onChange={(event) => setHours(event.target.value)} />
        </div>
        <Button type="submit" variant="outline" disabled={busy}>Kaydet</Button>
      </form>
    </section>
  );
}

export function reservationTone(checkedIn: boolean): string {
  return checkedIn
    ? "rounded-2xl bg-court px-3 py-2 text-sm text-white"
    : "rounded-2xl border border-dashed border-clay bg-white px-3 py-2 text-sm text-ink";
}
