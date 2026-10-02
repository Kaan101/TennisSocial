"use client";

import { istanbulNowParts, waLink } from "@club/shared";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type CourtCell, type Slot, type SlotPerson, fullName, shiftDate } from "@/components/court-ui";
import { ErrorState, LoadingBlock } from "@/components/states";
import { useAuth } from "@/lib/auth";
import { useClub } from "@/lib/club";
import { useResource } from "@/lib/use-resource";

type Board = {
  weekStart: string;
  hours: string[];
  days: { date: string; weekday: number; label: string; short: string }[];
  slots: Slot[];
};

type Picked = { date: string; start: string };
type BoardDay = Board["days"][number];
type ViewMode = "hafta" | "gun" | "liste";
type Tone = "open" | "partial" | "busy" | "full";

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const LAST_HOUR = "21:00";
const TONE_FILL: Record<Tone, string> = {
  open: "#d1fae5",
  partial: "#fef3c7",
  busy: "#fce7f3",
  full: "#e5e7eb",
};
const TONE_INK: Record<Tone, string> = {
  open: "#14532d",
  partial: "#78350f",
  busy: "#9d174d",
  full: "#374151",
};
const SELECTED_FILL = "#1e3a5f";
const DAY_PURPLE = "#6d28d9";

function weekRange(start: string, end: string): string {
  const [startYear, startMonth, startDay] = start.split("-");
  const [endYear, endMonth, endDay] = end.split("-");
  const startName = TR_MONTHS[Number(startMonth) - 1] ?? "";
  const endName = TR_MONTHS[Number(endMonth) - 1] ?? "";
  if (!startName || !endName) return "";
  if (startYear === endYear && startMonth === endMonth) return `${Number(startDay)}–${Number(endDay)} ${startName} ${startYear}`;
  if (startYear === endYear) return `${Number(startDay)} ${startName} – ${Number(endDay)} ${endName} ${startYear}`;
  return `${Number(startDay)} ${startName} ${startYear} – ${Number(endDay)} ${endName} ${endYear}`;
}

function longDate(date: string, label: string): string {
  const [year, month, day] = date.split("-");
  const name = TR_MONTHS[Number(month) - 1] ?? "";
  return `${Number(day)} ${name} ${year}, ${label}`;
}

function courtIsFree(court: CourtCell): boolean {
  if (court.state === "reserved") return false;
  const purpose = court.reservation?.purpose;
  return purpose !== "MATCH" && purpose !== "TRAINING" && purpose !== "MAINTENANCE" && purpose !== "TOURNAMENT";
}

function toneOf(free: number, total: number): Tone {
  if (total < 1 || free < 1) return "full";
  const ratio = free / total;
  if (ratio >= 0.5) return "open";
  if (ratio >= 0.25) return "partial";
  return "busy";
}

function slotFacts(slot: Slot | undefined): { free: number; total: number; players: number; tone: Tone } {
  const total = slot?.courts.length ?? 0;
  const free = slot?.courts.filter(courtIsFree).length ?? 0;
  const players = slot?.people.length ?? 0;
  return { free, total, players, tone: toneOf(free, total) };
}

export function TakvimView() {
  const { user } = useAuth();
  const { clubId, ready } = useClub();
  const params = useSearchParams();
  const queryDate = params.get("date");
  const queryStart = params.get("start");
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [phoneDay, setPhoneDay] = useState<string | null>(queryDate);
  const [mode, setMode] = useState<ViewMode>("hafta");
  const [queryApplied, setQueryApplied] = useState(false);
  const boardQuery = new URLSearchParams();
  if (week) boardQuery.set("week", week);
  if (clubId) boardQuery.set("club", clubId);
  const boardQueryText = boardQuery.toString();
  const boardPath = boardQueryText ? `/courts/board?${boardQueryText}` : "/courts/board";
  const board = useResource<Board>(user && ready ? boardPath : null);

  const hours = useMemo(() => (board.data?.hours ?? []).filter((hour) => hour <= LAST_HOUR), [board.data]);
  const slots = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const item of board.data?.slots ?? []) map.set(`${item.date}|${item.startTime}`, item);
    return map;
  }, [board.data]);

  useEffect(() => {
    if (queryApplied || !board.data || !queryDate || !queryStart) return;
    const inWeek = board.data.days.some((day) => day.date === queryDate);
    if (!inWeek || !hours.includes(queryStart)) {
      setQueryApplied(true);
      return;
    }
    setPicked({ date: queryDate, start: queryStart });
    setPhoneDay(queryDate);
    setQueryApplied(true);
  }, [queryApplied, board.data, queryDate, queryStart, hours]);

  useEffect(() => {
    if (!board.data || hours.length === 0) return;
    if (!queryApplied && queryDate && queryStart) return;
    const days = board.data.days;
    if (picked && days.some((day) => day.date === picked.date) && hours.includes(picked.start)) return;
    const today = istanbulNowParts().day;
    const day = days.find((item) => item.date === (phoneDay ?? today)) ?? days.find((item) => item.date === today) ?? days[0];
    const hour = hours.includes(picked?.start ?? "") ? picked?.start : hours[0];
    if (!day || !hour) return;
    setPicked({ date: day.date, start: hour });
    setPhoneDay(day.date);
  }, [board.data, hours, picked, phoneDay, queryApplied, queryDate, queryStart]);

  function choose(date: string, start: string) {
    flushSync(() => {
      setPicked({ date, start });
      setPhoneDay(date);
    });
  }

  if (!ready || board.loading || !user) return <LoadingBlock label="Takvim yükleniyor" />;
  if (board.error || !board.data) return <ErrorState message={board.error ?? "Takvim açılmadı"} onRetry={() => void board.reload()} />;

  const data = board.data;
  const pickedDay = data.days.find((day) => day.date === picked?.date) ?? data.days[0];
  const slot = picked && pickedDay ? slots.get(`${pickedDay.date}|${picked.start}`) ?? null : null;
  const range = weekRange(data.days[0]?.date ?? "", data.days[6]?.date ?? "");

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 lg:flex-row lg:items-start">
      <section className="min-w-0 flex-1 rounded-2xl border border-[#e5e7eb] bg-white p-3">
        <WeekBar
          range={range}
          onPrev={() => setWeek(shiftDate(data.weekStart, -7))}
          onNext={() => setWeek(shiftDate(data.weekStart, 7))}
          onToday={() => {
            setWeek(undefined);
            const today = istanbulNowParts().day;
            const hour = picked?.start ?? hours[0] ?? "08:00";
            setPhoneDay(today);
            setPicked({ date: today, start: hour });
          }}
        />
        <ViewSwitch mode={mode} onMode={setMode} />
        <div className="mt-3 hidden lg:block">
          {mode === "hafta" ? (
            <WeekGrid days={data.days} hours={hours} slots={slots} picked={picked} onPick={choose} />
          ) : null}
          {mode === "gun" && pickedDay ? (
            <DayColumn day={pickedDay} hours={hours} slots={slots} picked={picked} onPick={choose} />
          ) : null}
          {mode === "liste" && pickedDay ? (
            <HourList day={pickedDay} hours={hours} slots={slots} picked={picked} onPick={choose} />
          ) : null}
        </div>
        <PhoneDay
          days={data.days}
          hours={hours}
          slots={slots}
          dayDate={pickedDay?.date ?? null}
          picked={picked}
          onDay={(date) => choose(date, picked?.start ?? hours[0] ?? "08:00")}
          onPick={choose}
        />
        {slot && pickedDay ? (
          <div className="mt-3 lg:hidden">
            <HourPanel day={pickedDay} slot={slot} />
          </div>
        ) : null}
        <Legend />
      </section>
      {slot && pickedDay ? (
        <div className="hidden lg:block lg:w-80 lg:shrink-0">
          <HourPanel day={pickedDay} slot={slot} />
        </div>
      ) : null}
    </div>
  );
}

function WeekBar({ range, onPrev, onNext, onToday }: { range: string; onPrev: () => void; onNext: () => void; onToday: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-label="Önceki hafta" onClick={onPrev} className="court-press grid h-8 w-8 place-items-center rounded-full border border-[#d1d5db] text-sm">‹</button>
      <p className="min-w-0 flex-1 text-center text-sm font-semibold">{range}</p>
      <button type="button" aria-label="Sonraki hafta" onClick={onNext} className="court-press grid h-8 w-8 place-items-center rounded-full border border-[#d1d5db] text-sm">›</button>
      <button type="button" onClick={onToday} className="court-press rounded-full border border-[#d1d5db] px-3 py-1 text-sm font-semibold">Bugün</button>
    </div>
  );
}

function ViewSwitch({ mode, onMode }: { mode: ViewMode; onMode: (mode: ViewMode) => void }) {
  const items: { id: ViewMode; label: string }[] = [
    { id: "hafta", label: "Hafta" },
    { id: "gun", label: "Gün" },
    { id: "liste", label: "Liste" },
  ];
  return (
    <div className="mt-3 hidden w-fit gap-1 rounded-xl bg-[#f3f4f6] p-1 lg:flex" role="tablist" aria-label="Görünüm">
      {items.map((item) => {
        const on = mode === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onMode(item.id)}
            className={`rounded-lg px-3 py-1 text-sm ${on ? "font-semibold text-white" : "text-[#374151]"}`}
            style={on ? { backgroundColor: DAY_PURPLE } : undefined}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function WeekGrid({
  days,
  hours,
  slots,
  picked,
  onPick,
}: {
  days: BoardDay[];
  hours: string[];
  slots: Map<string, Slot>;
  picked: Picked | null;
  onPick: (date: string, start: string) => void;
}) {
  return (
    <div className="takvim-week grid gap-1" style={{ gridTemplateColumns: "3.25rem repeat(7, minmax(0, 1fr))" }}>
      <div className="px-1 text-[11px] font-semibold text-[#6b7280]">Saat</div>
      {days.map((day) => {
        const on = picked?.date === day.date;
        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onPick(day.date, picked?.start ?? hours[0] ?? "08:00")}
            className="rounded-lg px-1 py-1 text-center text-[11px] font-semibold leading-tight"
            style={on ? { backgroundColor: DAY_PURPLE, color: "#ffffff" } : { color: "#374151" }}
          >
            {day.short} {Number(day.date.slice(8))}
          </button>
        );
      })}
      {hours.map((hour) => (
        <HourRow key={hour} hour={hour} days={days} slots={slots} picked={picked} onPick={onPick} />
      ))}
    </div>
  );
}

function HourRow({
  hour,
  days,
  slots,
  picked,
  onPick,
}: {
  hour: string;
  days: BoardDay[];
  slots: Map<string, Slot>;
  picked: Picked | null;
  onPick: (date: string, start: string) => void;
}) {
  return (
    <>
      <div className="flex items-center text-[11px] text-[#6b7280]">{hour}</div>
      {days.map((day) => (
        <CountCell
          key={day.date}
          day={day}
          hour={hour}
          slot={slots.get(`${day.date}|${hour}`)}
          selected={picked?.date === day.date && picked.start === hour}
          onPick={onPick}
        />
      ))}
    </>
  );
}

function DayColumn({
  day,
  hours,
  slots,
  picked,
  onPick,
}: {
  day: BoardDay;
  hours: string[];
  slots: Map<string, Slot>;
  picked: Picked | null;
  onPick: (date: string, start: string) => void;
}) {
  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-1">
      <div className="text-[11px] font-semibold text-[#6b7280]">Saat</div>
      <div className="rounded-lg px-2 py-1 text-center text-sm font-semibold text-white" style={{ backgroundColor: DAY_PURPLE }}>
        {day.short} {Number(day.date.slice(8))}
      </div>
      {hours.map((hour) => (
        <FragmentRow key={hour} hour={hour} day={day} slot={slots.get(`${day.date}|${hour}`)} selected={picked?.date === day.date && picked.start === hour} onPick={onPick} />
      ))}
    </div>
  );
}

function FragmentRow({
  hour,
  day,
  slot,
  selected,
  onPick,
}: {
  hour: string;
  day: BoardDay;
  slot: Slot | undefined;
  selected: boolean;
  onPick: (date: string, start: string) => void;
}) {
  return (
    <>
      <div className="flex items-center text-[11px] text-[#6b7280]">{hour}</div>
      <CountCell day={day} hour={hour} slot={slot} selected={selected} onPick={onPick} />
    </>
  );
}

function HourList({
  day,
  hours,
  slots,
  picked,
  onPick,
}: {
  day: BoardDay;
  hours: string[];
  slots: Map<string, Slot>;
  picked: Picked | null;
  onPick: (date: string, start: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {hours.map((hour) => {
        const slot = slots.get(`${day.date}|${hour}`);
        const selected = picked?.date === day.date && picked.start === hour;
        const facts = slotFacts(slot);
        return (
          <li key={hour}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(day.date, hour)}
              className="court-press flex w-full items-center justify-between rounded-xl px-3 py-2 text-left"
              style={{ backgroundColor: selected ? SELECTED_FILL : TONE_FILL[facts.tone], color: selected ? "#ffffff" : TONE_INK[facts.tone] }}
            >
              <span className="text-sm font-semibold">{hour}</span>
              <Counts free={facts.free} players={facts.players} ink={selected ? "#ffffff" : TONE_INK[facts.tone]} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CountCell({
  day,
  hour,
  slot,
  selected,
  onPick,
}: {
  day: BoardDay;
  hour: string;
  slot: Slot | undefined;
  selected: boolean;
  onPick: (date: string, start: string) => void;
}) {
  const facts = slotFacts(slot);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${day.label} ${hour}, ${facts.free} boş kort, ${facts.players} oyuncu`}
      onClick={() => onPick(day.date, hour)}
      className="court-press flex min-h-11 items-center justify-center rounded-lg px-1"
      style={{ backgroundColor: selected ? SELECTED_FILL : TONE_FILL[facts.tone], color: selected ? "#ffffff" : TONE_INK[facts.tone] }}
    >
      <Counts free={facts.free} players={facts.players} ink={selected ? "#ffffff" : TONE_INK[facts.tone]} />
    </button>
  );
}

function Counts({ free, players, ink }: { free: number; players: number; ink: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#16a34a] px-1 text-[10px] font-semibold leading-none text-white">{free}</span>
      <span className="text-sm font-semibold leading-none" style={{ color: ink }}>{players}</span>
    </span>
  );
}

function Legend() {
  const items: { tone: Tone; label: string }[] = [
    { tone: "open", label: "Müsait" },
    { tone: "partial", label: "Kısmen dolu" },
    { tone: "busy", label: "Yoğun" },
    { tone: "full", label: "Dolu" },
  ];
  return (
    <ul className="mt-3 flex flex-wrap gap-3 text-xs text-[#4b5563]">
      {items.map((item) => (
        <li key={item.tone} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: TONE_FILL[item.tone] }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function PhoneDay({
  days,
  hours,
  slots,
  dayDate,
  picked,
  onDay,
  onPick,
}: {
  days: BoardDay[];
  hours: string[];
  slots: Map<string, Slot>;
  dayDate: string | null;
  picked: Picked | null;
  onDay: (date: string) => void;
  onPick: (date: string, start: string) => void;
}) {
  const index = Math.max(0, days.findIndex((day) => day.date === dayDate));
  const day = days[index] ?? days[0];
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  if (!day) return null;

  function moveDay(direction: number) {
    const next = days[index + direction];
    if (!next) return;
    onDay(next.date);
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    start.current = { x: event.clientX, y: event.clientY };
    swiped.current = false;
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    swiped.current = true;
    moveDay(dx < 0 ? 1 : -1);
  }

  return (
    <div
      className="mt-3 lg:hidden"
      style={{ touchAction: "pan-y" }}
      onPointerDown={pointerDown}
      onPointerUp={pointerUp}
      onClickCapture={(event) => {
        if (!swiped.current) return;
        event.preventDefault();
        event.stopPropagation();
        swiped.current = false;
      }}
    >
      <div className="flex gap-1 overflow-x-auto pb-2">
        {days.map((item) => {
          const on = item.date === day.date;
          return (
            <button
              key={item.date}
              type="button"
              onClick={() => onDay(item.date)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold"
              style={on ? { backgroundColor: DAY_PURPLE, color: "#ffffff" } : { backgroundColor: "#f3f4f6", color: "#374151" }}
            >
              {item.short} {Number(item.date.slice(8))}
            </button>
          );
        })}
      </div>
      <DayColumn day={day} hours={hours} slots={slots} picked={picked} onPick={onPick} />
    </div>
  );
}

function HourPanel({ day, slot }: { day: BoardDay; slot: Slot }) {
  const [tab, setTab] = useState<"players" | "courts">("players");
  const courts = slot.courts.filter(courtIsFree).slice().sort((left, right) => left.name.localeCompare(right.name, "tr"));
  const people = slot.people.slice().sort((left, right) => fullName(left).localeCompare(fullName(right), "tr"));
  return (
    <aside className="w-full rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <p className="text-sm font-semibold">{longDate(day.date, day.label)}</p>
      <p className="mt-1 text-lg font-semibold">{slot.startTime} – {slot.endTime}</p>
      <Link
        href={`/kortlar?date=${slot.date}&hour=${slot.startTime}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block rounded-xl px-3 py-2 text-center text-sm font-semibold text-white"
        style={{ backgroundColor: SELECTED_FILL }}
      >
        Bu saatte etkinlik oluştur
      </Link>
      <div className="mt-4 flex gap-4 border-b border-[#e5e7eb] text-sm" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "players"} onClick={() => setTab("players")} className={`pb-2 ${tab === "players" ? "border-b-2 font-semibold" : "text-[#6b7280]"}`} style={tab === "players" ? { borderColor: DAY_PURPLE, color: DAY_PURPLE } : undefined}>
          Oyuncular ({slot.people.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === "courts"} onClick={() => setTab("courts")} className={`pb-2 ${tab === "courts" ? "border-b-2 font-semibold" : "text-[#6b7280]"}`} style={tab === "courts" ? { borderColor: DAY_PURPLE, color: DAY_PURPLE } : undefined}>
          Kortlar ({courts.length})
        </button>
      </div>
      {tab === "players" ? (
        <ul className="mt-3 space-y-2">
          {people.map((person) => (
            <PlayerRow key={person.id} person={person} />
          ))}
        </ul>
      ) : (
        <ul className="mt-3 space-y-2">
          {courts.map((court) => (
            <li key={court.id} className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{court.name}</p>
              <Link
                href={`/kortlar?date=${slot.date}&court=${court.id}&hour=${slot.startTime}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm font-semibold text-[#15803d]"
              >
                Rezerve Et
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function PlayerRow({ person }: { person: SlotPerson }) {
  const href = person.messageNumber ? waLink(person.messageNumber, person.firstName) : null;
  return (
    <li className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] px-2 py-2">
      <Face person={person} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{fullName(person)}</p>
        {person.levelLabel ? <p className="text-xs text-[#6b7280]">{person.levelLabel}</p> : null}
      </div>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm font-semibold text-[#15803d]">Davet Et</a>
      ) : (
        <span className="shrink-0 text-sm text-[#9ca3af]">Davet Et</span>
      )}
    </li>
  );
}

function Face({ person }: { person: SlotPerson }) {
  if (person.photoUrl) {
    return <img src={person.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />; // eslint-disable-line @next/next/no-img-element
  }
  const letters = `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toLocaleUpperCase("tr-TR");
  return <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#1e3a5f] text-xs font-semibold text-white">{letters}</span>;
}
