"use client";

import { COURT_PURPOSE_LABELS, WEEKDAYS, type CourtPurpose } from "@club/shared";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/states";

type Person = { id: string; firstName: string; lastName: string };
type SlotPerson = Person & { overallLevel: string; levelLabel: string };
type CourtCell = {
  id: string;
  name: string;
  state: "free" | "reserved";
  reservation: null | {
    id: string;
    purpose: CourtPurpose;
    purposeLabel: string;
    checkedIn: boolean;
    canCheckIn: boolean;
    checkInHint: string | null;
    players: Person[] | null;
  };
};
type Slot = {
  date: string;
  weekday: number;
  startTime: string;
  endTime: string;
  green: boolean;
  people: SlotPerson[];
  courts: CourtCell[];
};
type Board = {
  weekStart: string;
  weekEnd: string;
  hours: string[];
  checkInLeadHours: number;
  viewer: { boardVisible: boolean; canApprove: boolean; purposes: CourtPurpose[] };
  days: { date: string; weekday: number; label: string; short: string }[];
  slots: Slot[];
};
type Offer = {
  id: string;
  date: string | null;
  startTime: string;
  from: Person;
  to: Person;
  canRespond: boolean;
};
type Reservation = {
  id: string;
  courtName: string;
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
type CourtRow = { id: string; name: string; active: boolean };

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function addHour(time: string): string {
  return `${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}:00`;
}

function fullName(person: Person): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function slotButtonClass(slot: Slot, selected: boolean): string {
  const tone = slot.green ? "border-court bg-court/15" : "border-line bg-surface";
  return `rounded-2xl border px-2 py-2 text-left text-[11px] ${tone} ${selected ? "ring-2 ring-court" : ""}`;
}

export default function CourtsPage() {
  const { user } = useAuth();
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState<{ date: string; startTime: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const board = useResource<Board>(user ? `/courts/board${week ? `?week=${week}` : ""}` : null);
  const offers = useResource<{ data: Offer[] }>(user ? "/slot-offers?scope=incoming" : null);
  const requests = useResource<{ data: Reservation[] }>(user ? "/reservations?status=PENDING&pageSize=50" : null);
  const courts = useResource<{ data: CourtRow[] }>(user ? (user.role === "ADMIN" ? "/courts?all=true" : "/courts") : null);
  const roster = useResource<{ data: Person[] }>(user ? "/players/search?pageSize=50" : null);

  async function refresh() {
    await Promise.all([board.reload(), offers.reload(), requests.reload(), courts.reload()]);
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

  if (board.loading || !user) return <LoadingBlock label="Kortlar yükleniyor" />;
  if (board.error || !board.data) return <ErrorState message={board.error ?? "Kortlar açılmadı"} onRetry={() => void board.reload()} />;

  const data = board.data;
  const selected = picked ? data.slots.find((slot) => slot.date === picked.date && slot.startTime === picked.startTime) ?? null : null;
  const dayLabel = data.days.find((day) => day.date === selected?.date);

  return (
    <div className="space-y-4">
      <PageHeader title="Kortlar" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setWeek(shiftDate(data.weekStart, -7))}>Önceki</Button>
          <p className="text-sm font-semibold">{data.weekStart} – {data.weekEnd}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setWeek(shiftDate(data.weekStart, 7))}>Sonraki</Button>
        </div>
        <Button
          type="button"
          size="sm"
          variant={data.viewer.boardVisible ? "outline" : "clay"}
          disabled={busy}
          onClick={() => void run(async () => {
            await api("/me/board-visibility", { method: "PATCH", body: JSON.stringify({ visible: !data.viewer.boardVisible }) });
          })}
        >
          {data.viewer.boardVisible ? "Tahtada görünüyorsun" : "Tahtada gizlisin"}
        </Button>
      </div>
      <p className="text-sm text-muted">
        Yeşil saat: en az iki görünen oyuncu var ve içlerinden bir çiftin seviyesi en fazla 1 basamak ayrı. Check-in, kort saatinden {data.checkInLeadHours} saat önce açılır ve saat başlayınca kapanır.
      </p>
      {message ? <p className="rounded-2xl bg-surface px-3 py-2 text-sm" role="status">{message}</p> : null}

      {(offers.data?.data.length ?? 0) > 0 ? (
        <section className="space-y-2 rounded-3xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Sana gelen maç teklifleri</h2>
          {offers.data?.data.map((offer) => (
            <div key={offer.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p>{fullName(offer.from)} · {offer.date} {offer.startTime}</p>
              {offer.canRespond ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={busy} onClick={() => void run(async () => { await api(`/slot-offers/${offer.id}/accept`, { method: "POST" }); })}>Kabul et</Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { await api(`/slot-offers/${offer.id}/decline`, { method: "POST" }); })}>Reddet</Button>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <div className="hidden overflow-x-auto md:block">
        <div className="grid min-w-[760px] gap-1" style={{ gridTemplateColumns: "4.5rem repeat(7, minmax(0, 1fr))" }}>
          <div />
          {data.days.map((day) => (
            <div key={day.date} className="px-1 pb-1 text-center text-xs font-semibold">
              {day.short}
              <div className="font-normal text-muted">{day.date.slice(8)}</div>
            </div>
          ))}
          {data.hours.map((hour) => (
            <Fragment key={hour}>
              <div className="py-2 text-xs text-muted">{hour}</div>
              {data.days.map((day) => {
                const slot = data.slots.find((item) => item.date === day.date && item.startTime === hour);
                if (!slot) return <div key={day.date} />;
                const selectedSlot = picked?.date === day.date && picked.startTime === hour;
                return (
                  <button key={day.date} type="button" className={slotButtonClass(slot, selectedSlot)} onClick={() => setPicked({ date: day.date, startTime: hour })}>
                    <SlotMarks slot={slot} />
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {data.days.map((day) => (
          <section key={day.date} className="space-y-1">
            <h2 className="text-sm font-semibold">{day.label}</h2>
            {data.hours.map((hour) => {
              const slot = data.slots.find((item) => item.date === day.date && item.startTime === hour);
              if (!slot) return null;
              return (
                <button key={hour} type="button" className={`flex w-full items-center justify-between ${slotButtonClass(slot, picked?.date === day.date && picked.startTime === hour)}`} onClick={() => setPicked({ date: day.date, startTime: hour })}>
                  <span className="font-semibold">{hour}</span>
                  <SlotMarks slot={slot} />
                </button>
              );
            })}
          </section>
        ))}
      </div>

      {selected ? (
        <SlotDetail
          slot={selected}
          dayLabel={dayLabel?.label ?? selected.date}
          viewerId={user.id}
          busy={busy}
          onOffer={(toUserId) => void run(async () => {
            await api("/slot-offers", { method: "POST", body: JSON.stringify({ toUserId, date: selected.date, startTime: selected.startTime }) });
            setMessage("Maç teklifi gönderildi.");
          })}
          onCheckIn={(reservationId) => void run(async () => {
            await api(`/reservations/${reservationId}/check-in`, {
              method: "POST",
              body: JSON.stringify({ date: selected.date, startTime: selected.startTime }),
            });
            setMessage("Check-in alındı.");
          })}
        />
      ) : (
        <p className="text-sm text-muted">Bir saate dokun. Müsait oyuncuları ve kortların durumunu görürsün.</p>
      )}

      <RequestForm
        courts={courts.data?.data.filter((court) => court.active) ?? []}
        purposes={data.viewer.purposes}
        hours={data.hours}
        people={(roster.data?.data ?? []).filter((person) => person.id !== user.id)}
        busy={busy}
        onSubmit={(body) => void run(async () => {
          await api("/reservations", { method: "POST", body: JSON.stringify(body) });
          setMessage(data.viewer.canApprove ? "Rezervasyon onaylı kaydedildi." : "Talep yönetici onayına düştü.");
        })}
      />

      <section className="space-y-2">
        <h2 className="font-semibold">{data.viewer.canApprove ? "Onay bekleyen talepler" : "Bekleyen taleplerin"}</h2>
        {(requests.data?.data.length ?? 0) === 0 ? <EmptyState title="Bekleyen talep yok" body="Yeni bir kort talebi açıldığında burada durur." /> : null}
        {requests.data?.data.map((item) => (
          <article key={item.id} className="rounded-3xl border border-line bg-surface p-4 text-sm">
            <p className="font-semibold">{item.courtName} · {item.purposeLabel}</p>
            <p className="text-muted">{item.startDate} – {item.endDate} · {item.startTime}–{item.endTime}</p>
            <p>{fullName(item.holder)}{item.partner ? ` ve ${fullName(item.partner)}` : ""}</p>
            {data.viewer.canApprove ? (
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" disabled={busy} onClick={() => void run(async () => { await api(`/reservations/${item.id}/approve`, { method: "POST" }); })}>Onayla</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { await api(`/reservations/${item.id}/reject`, { method: "POST" }); })}>Reddet</Button>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      {data.viewer.canApprove ? (
        <AdminCourts
          courts={courts.data?.data ?? []}
          lead={data.checkInLeadHours}
          busy={busy}
          onCreate={(name) => void run(async () => { await api("/courts", { method: "POST", body: JSON.stringify({ name }) }); })}
          onToggle={(court) => void run(async () => { await api(`/courts/${court.id}`, { method: "PATCH", body: JSON.stringify({ active: !court.active }) }); })}
          onLead={(hours) => void run(async () => { await api("/settings/check-in-lead", { method: "PATCH", body: JSON.stringify({ hours }) }); })}
        />
      ) : null}
    </div>
  );
}

function SlotMarks({ slot }: { slot: Slot }) {
  const reserved = slot.courts.filter((court) => court.state === "reserved");
  return (
    <span className="flex flex-col gap-1">
      {slot.green ? <span className="font-semibold text-court">Uygun</span> : <span className="text-muted">—</span>}
      {reserved.length > 0 ? <span className="text-muted">{reserved.length} dolu</span> : null}
    </span>
  );
}

function SlotDetail({
  slot,
  dayLabel,
  viewerId,
  busy,
  onOffer,
  onCheckIn,
}: {
  slot: Slot;
  dayLabel: string;
  viewerId: string;
  busy: boolean;
  onOffer: (toUserId: string) => void;
  onCheckIn: (reservationId: string) => void;
}) {
  return (
    <section id="slot-detay" className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <h2 className="font-semibold">{dayLabel} · {slot.startTime}</h2>
      <div>
        <h3 className="text-sm font-semibold">Müsait oyuncular</h3>
        {slot.people.length === 0 ? <p className="mt-1 text-sm text-muted">Bu saatte görünen müsait oyuncu yok.</p> : null}
        <ul className="mt-2 space-y-2">
          {slot.people.map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{fullName(person)} · {person.levelLabel}</span>
              {person.id !== viewerId ? (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onOffer(person.id)}>Maç teklif et</Button>
              ) : (
                <span className="text-xs text-muted">Sen</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Kortlar</h3>
        {slot.courts.length === 0 ? <p className="text-sm text-muted">Aktif kort yok.</p> : null}
        {slot.courts.map((court) => {
          if (court.state === "free" || !court.reservation) {
            return <p key={court.id} className="rounded-2xl border border-line px-3 py-2 text-sm">{court.name} · boş</p>;
          }
          const reservation = court.reservation;
          const players = reservation.players ?? [];
          return (
            <div key={court.id} className={reservation.checkedIn ? "rounded-2xl bg-court px-3 py-2 text-sm text-white" : "rounded-2xl border border-dashed border-clay bg-white px-3 py-2 text-sm text-ink"}>
              <p className="font-semibold">{court.name} · {reservation.purposeLabel}</p>
              <p>{reservation.checkedIn ? "Check-in yapıldı" : "Check-in yok"}</p>
              {players.length > 0 ? <p>{players.map(fullName).join(" · ")}</p> : null}
              {reservation.canCheckIn ? (
                <Button type="button" size="sm" variant={reservation.checkedIn ? "outline" : "clay"} className="mt-2" disabled={busy} onClick={() => onCheckIn(reservation.id)}>Check-in</Button>
              ) : reservation.checkInHint ? <p className="mt-1 text-xs opacity-80">{reservation.checkInHint}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RequestForm({
  courts,
  purposes,
  hours,
  people,
  busy,
  onSubmit,
}: {
  courts: CourtRow[];
  purposes: CourtPurpose[];
  hours: string[];
  people: Person[];
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
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

  return (
    <form
      className="space-y-3 rounded-3xl border border-line bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!courtId) return;
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
            partnerId: chosenPurpose === "MATCH" ? partnerId : null,
          });
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
          partnerId: chosenPurpose === "MATCH" ? partnerId : null,
        });
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
        {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
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
      <Button type="submit" disabled={busy || courts.length === 0}>Talep gönder</Button>
    </form>
  );
}

function AdminCourts({
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
        <Input aria-label="Yeni kort adı" value={name} onChange={(event) => setName(event.target.value)} placeholder="Kort 1" />
        <Button type="submit" disabled={busy}>Ekle</Button>
      </form>
      <ul className="space-y-2 text-sm">
        {courts.map((court) => (
          <li key={court.id} className="flex items-center justify-between gap-2">
            <span>{court.name}{court.active ? "" : " · kapalı"}</span>
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
