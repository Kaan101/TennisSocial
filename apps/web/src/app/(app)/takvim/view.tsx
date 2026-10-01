"use client";

import { istanbulNowParts, waLink } from "@club/shared";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
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

function panelCourtName(court: CourtCell): string {
  const indoor = /^Kapalı\s*(\d+)$/u.exec(court.name);
  if (court.kind === "BALLOON" || indoor) {
    const number = indoor?.[1] ?? /(\d+)/u.exec(court.name)?.[1];
    return number ? `Kapalı ${number}` : "Kapalı";
  }
  const number = /(\d+)/u.exec(court.name)?.[1];
  return number ? `Kort${number}` : court.name.replace(/\s+/gu, "");
}

function courtOrder(court: CourtCell): number {
  const number = Number(/(\d+)/u.exec(court.name)?.[1] ?? 0);
  return court.kind === "BALLOON" || court.name.startsWith("Kapalı") ? number : 100 + number;
}

function courtIsFree(court: CourtCell): boolean {
  if (court.state === "reserved") return false;
  const purpose = court.reservation?.purpose;
  return purpose !== "MATCH" && purpose !== "TRAINING" && purpose !== "MAINTENANCE" && purpose !== "TOURNAMENT";
}

function circleLabel(court: CourtCell): string {
  const number = /(\d+)/u.exec(court.name)?.[1];
  if (court.kind === "BALLOON" || court.name.startsWith("Kapalı")) return number ? `K${number}` : "";
  return number ?? "";
}

function freeCourtsOf(slot: Slot): CourtCell[] {
  return slot.courts.filter(courtIsFree).sort((left, right) => courtOrder(left) - courtOrder(right));
}

const WeekCell = memo(function WeekCell({
  dayLabel,
  date,
  hour,
  slot,
  selected,
  onPick,
}: {
  dayLabel: string;
  date: string;
  hour: string;
  slot: Slot | undefined;
  selected: boolean;
  onPick: (date: string, start: string) => void;
}) {
  if (!slot) return <div className="min-h-0" />;
  const freeCourts = freeCourtsOf(slot);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${dayLabel} ${hour}`}
      onClick={() => onPick(date, hour)}
      className={`court-press flex h-full min-h-0 w-full min-w-0 cursor-pointer flex-row items-center justify-center gap-0.5 overflow-hidden border-2 border-[#d1d5db] bg-transparent p-px lg:flex-col lg:justify-center ${selected ? "ring-2 ring-ink ring-inset" : ""}`}
      style={{ borderRadius: 4 }}
    >
      <HourCounts players={slot.people.length} courts={freeCourts.length} compact />
    </button>
  );
});

function nameInitials(person: SlotPerson): string {
  const first = Array.from(person.firstName.trim())[0];
  const last = Array.from(person.lastName.trim())[0];
  return [first, last]
    .filter((letter): letter is string => Boolean(letter))
    .map((letter) => letter.toLocaleUpperCase("tr-TR"))
    .join(" ");
}

export function TakvimView() {
  const { user } = useAuth();
  const { clubId, ready } = useClub();
  const params = useSearchParams();
  const queryDate = params.get("date");
  const queryStart = params.get("start");
  const [week, setWeek] = useState<string | undefined>(queryDate ?? undefined);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [openHour, setOpenHour] = useState<Picked | null>(null);
  const [phoneDay, setPhoneDay] = useState<string | null>(queryDate);
  const [queryApplied, setQueryApplied] = useState(false);
  const boardQuery = new URLSearchParams();
  if (week) boardQuery.set("week", week);
  if (clubId) boardQuery.set("club", clubId);
  const boardQueryText = boardQuery.toString();
  const boardPath = boardQueryText ? `/courts/board?${boardQueryText}` : "/courts/board";
  const board = useResource<Board>(user && ready ? boardPath : null);

  useEffect(() => {
    if (queryApplied || !board.data || !queryDate || !queryStart) return;
    const inWeek = board.data.days.some((day) => day.date === queryDate);
    if (!inWeek) {
      setWeek(queryDate);
      return;
    }
    if (!board.data.hours.includes(queryStart)) {
      setQueryApplied(true);
      return;
    }
    setPicked({ date: queryDate, start: queryStart });
    setOpenHour({ date: queryDate, start: queryStart });
    setPhoneDay(queryDate);
    setQueryApplied(true);
  }, [queryApplied, board.data, queryDate, queryStart]);

  const slots = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const item of board.data?.slots ?? []) map.set(`${item.date}|${item.startTime}`, item);
    return map;
  }, [board.data]);
  const onPick = useCallback((date: string, start: string) => {
    flushSync(() => setPicked({ date, start }));
  }, []);

  function toggleHour(date: string, start: string) {
    setOpenHour((current) => (current?.date === date && current.start === start ? null : { date, start }));
  }

  if (!ready || board.loading || !user) return <LoadingBlock label="Takvim yükleniyor" />;
  if (board.error || !board.data) return <ErrorState message={board.error ?? "Takvim açılmadı"} onRetry={() => void board.reload()} />;

  const data = board.data;
  const slot = picked ? slots.get(`${picked.date}|${picked.start}`) ?? null : null;
  const courts = slot ? freeCourtsOf(slot) : [];

  return (
    <div className="flex h-[calc(100dvh-13.25rem)] w-full min-w-0 flex-col gap-1 overflow-hidden">
      <style>{`
        .takvim-board { grid-template-columns: 2.75rem repeat(7, minmax(0, 1fr)); }
        @media (min-width: 64rem) {
          .takvim-board { grid-template-columns: 3.25rem repeat(7, minmax(6.25rem, 1fr)); }
        }
      `}</style>
      <h1 className="shrink-0 text-lg font-semibold leading-none">Takvim</h1>
      <PhoneDay
        days={data.days}
        hours={data.hours}
        slots={data.slots}
        dayDate={phoneDay}
        openHour={openHour}
        onDay={(date) => {
          setPhoneDay(date);
          setOpenHour(null);
        }}
        onToggleHour={toggleHour}
      />
      <div className="hidden w-full shrink-0 items-center gap-2 text-sm leading-none lg:flex">
        <button type="button" className="court-press shrink-0 py-0.5" onClick={() => { setWeek(shiftDate(data.weekStart, -7)); setPicked(null); }}>önceki</button>
        <p className="min-w-0 flex-1 text-center text-xs text-muted">{data.days[0]?.date} – {data.days[6]?.date}</p>
        <button type="button" className="court-press shrink-0 py-0.5" onClick={() => { setWeek(shiftDate(data.weekStart, 7)); setPicked(null); }}>sonraki</button>
      </div>
      <div className="hidden min-h-0 w-full flex-1 lg:flex lg:flex-row lg:items-stretch lg:gap-1.5">
        <div className="min-h-0 w-full min-w-0 flex-1 overflow-x-auto lg:h-full">
          <div
            className="takvim-board grid h-full w-full min-w-full gap-x-0.5 gap-y-px lg:gap-0.5"
            style={{ gridTemplateRows: `auto repeat(${data.hours.length}, minmax(0, 1fr))` }}
          >
            <div />
            {data.days.map((day) => (
              <div key={day.date} className="flex min-h-0 min-w-0 flex-col items-center justify-end pb-px text-center">
                <span className="text-[10px] font-semibold leading-none lg:hidden">{day.short}</span>
                <span className="hidden max-w-full truncate text-[10px] font-semibold leading-none lg:block">{day.label}</span>
                <span className="mt-px hidden text-[9px] font-normal leading-none text-muted lg:block">{day.date.slice(8)}</span>
              </div>
            ))}
            {data.hours.map((hour) => (
              <Fragment key={hour}>
                <div className="flex items-center whitespace-nowrap text-[10px] font-normal leading-none text-ink">{hour}</div>
                {data.days.map((day) => (
                  <WeekCell
                    key={day.date}
                    dayLabel={day.label}
                    date={day.date}
                    hour={hour}
                    slot={slots.get(`${day.date}|${hour}`)}
                    selected={picked?.date === day.date && picked.start === hour}
                    onPick={onPick}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        <aside className="h-36 w-full shrink-0 overflow-y-auto lg:h-auto lg:w-64 lg:shrink-0">
          {slot ? (
            <div className="space-y-1.5 lg:space-y-3">
              <ul className="flex flex-wrap gap-1 lg:gap-2">
                {slot.people.map((person) => (
                  <li key={person.id}>
                    <PlayerChip person={person} />
                  </li>
                ))}
              </ul>
              <ul className="flex flex-wrap gap-1 lg:gap-2">
                {courts.map((court) => (
                  <li key={court.id}>
                    <Link
                      href={`/kortlar?date=${slot.date}&court=${court.id}&hour=${slot.startTime}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-[9px] font-semibold leading-none text-ink lg:h-auto lg:w-auto lg:rounded-md lg:px-2 lg:py-1 lg:text-sm"
                    >
                      <span className="lg:hidden">{circleLabel(court)}</span>
                      <span className="hidden lg:inline">{panelCourtName(court)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function PhoneDay({
  days,
  hours,
  slots,
  dayDate,
  openHour,
  onDay,
  onToggleHour,
}: {
  days: BoardDay[];
  hours: string[];
  slots: Slot[];
  dayDate: string | null;
  openHour: Picked | null;
  onDay: (date: string) => void;
  onToggleHour: (date: string, start: string) => void;
}) {
  const bySlot = new Map(slots.map((item) => [`${item.date}|${item.startTime}`, item]));
  const today = istanbulNowParts().day;
  const index = Math.max(0, days.findIndex((day) => day.date === (dayDate ?? today)));
  const day = days[index] ?? days[0];
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const [slide, setSlide] = useState<0 | 1 | -1>(0);
  if (!day) return null;

  function moveDay(direction: number) {
    const next = days[index + direction];
    if (!next) return;
    setSlide(direction > 0 ? 1 : -1);
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
      className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto lg:hidden"
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
      <style>{`
        .takvim-day-next { animation: takvim-slide-next 180ms ease; }
        .takvim-day-prev { animation: takvim-slide-prev 180ms ease; }
        @keyframes takvim-slide-next { from { transform: translateX(2rem); } to { transform: translateX(0); } }
        @keyframes takvim-slide-prev { from { transform: translateX(-2rem); } to { transform: translateX(0); } }
      `}</style>
      <div key={day.date} className={slide === 1 ? "takvim-day-next" : slide === -1 ? "takvim-day-prev" : undefined}>
        <div className="py-2 text-center">
          <p className="text-lg font-semibold leading-tight">{day.label}</p>
          <p className="text-xs text-muted">{day.date.slice(8)}</p>
        </div>
        <div className="flex flex-col gap-0.5">
          {hours.map((hour) => {
            const cell = bySlot.get(`${day.date}|${hour}`);
            const freeCourts = cell ? freeCourtsOf(cell) : [];
            const players = cell?.people ?? [];
            const hourOpen = openHour?.date === day.date && openHour.start === hour;
            return (
              <div key={hour} className={`border-t border-line ${hourOpen ? "bg-[#ddd9d2]" : ""}`}>
                <button
                  type="button"
                  aria-expanded={hourOpen}
                  aria-label={`${day.label} ${hour}`}
                  onClick={() => onToggleHour(day.date, hour)}
                  className={`court-press flex w-full items-center px-1 py-2 text-left text-base font-normal leading-none ${hourOpen ? "bg-[#ddd9d2]" : ""}`}
                >
                  <span>{hour}</span>
                  <HourCounts players={players.length} courts={freeCourts.length} className="ml-[2.5ch]" />
                </button>
                {hourOpen && cell ? (
                  <div className="space-y-2 bg-[#ddd9d2] px-1 py-2">
                    <ul className="flex max-w-full flex-wrap gap-1">
                      {freeCourts.map((court) => (
                        <li key={court.id}>
                          <PhoneCourtLink court={court} date={day.date} hour={hour} />
                        </li>
                      ))}
                    </ul>
                    <ul className="flex max-w-full flex-wrap gap-1">
                      {players.map((person) => (
                        <li key={person.id}>
                          <PlayerChip person={person} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PhoneCourtLink({ court, date, hour }: { court: CourtCell; date: string; hour: string }) {
  const indoor = court.kind === "BALLOON" || court.name.startsWith("Kapalı");
  return (
    <Link
      href={`/kortlar?date=${date}&court=${court.id}&hour=${hour}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-1.5 py-1 text-sm font-semibold leading-none ${indoor ? "border-[#2563eb] bg-[#eff6ff] text-[#2563eb]" : "border-[#d1d5db] bg-transparent text-ink"}`}
    >
      {court.name}
    </Link>
  );
}

function HourCounts({
  players,
  courts,
  compact = false,
  className = "",
}: {
  players: number;
  courts: number;
  compact?: boolean;
  className?: string;
}) {
  if (players < 1 && courts < 1) return null;
  const size = compact
    ? "h-3.5 min-w-3.5 px-0.5 text-[9px]"
    : "h-5 min-w-5 px-1 text-[11px]";
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {players > 0 ? (
        <span className={`inline-flex items-center justify-center rounded-full bg-[#0f6e49] font-semibold leading-none text-white ${size}`}>
          {players}
        </span>
      ) : null}
      {courts > 0 ? (
        <span className={`inline-flex items-center justify-center rounded-full bg-[#6D28D9] font-semibold leading-none text-white ${size}`}>
          {courts}
        </span>
      ) : null}
    </span>
  );
}

function PersonFace({ person, className }: { person: SlotPerson; className: string }) {
  if (person.photoUrl) {
    return <img src={person.photoUrl} alt="" className={`${className} rounded-full object-cover`} />; // eslint-disable-line @next/next/no-img-element
  }
  const letters = `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toLocaleUpperCase("tr-TR");
  return (
    <span className={`${className} inline-flex items-center justify-center rounded-full bg-court-deep font-semibold leading-none text-white`}>
      {letters}
    </span>
  );
}

function PlayerChip({ person }: { person: SlotPerson }) {
  const className = "inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1 py-0.5 lg:gap-2 lg:px-2 lg:py-1";
  const body = (
    <>
      <PersonFace person={person} className="h-5 w-5 text-[8px] lg:h-8 lg:w-8 lg:text-xs" />
      <span className="text-[11px] leading-none lg:hidden">{nameInitials(person)}</span>
      <span className="hidden text-sm lg:inline">{fullName(person)}</span>
    </>
  );
  const href = person.messageNumber ? waLink(person.messageNumber, person.firstName) : null;
  if (!href) return <span className={className}>{body}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  );
}
