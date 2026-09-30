"use client";

import { waLink } from "@club/shared";
import { User } from "lucide-react";
import { Fragment, useEffect, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type CourtCell, type Slot, type SlotPerson, fullName, shiftDate } from "@/components/court-ui";
import { ErrorState, LoadingBlock } from "@/components/states";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";

type Board = {
  weekStart: string;
  hours: string[];
  days: { date: string; weekday: number; label: string; short: string }[];
  slots: Slot[];
};

type Picked = { date: string; start: string };

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

function phoneFace(freeCourts: number): string {
  if (freeCourts < 1) return "border-line bg-transparent";
  return "border-court bg-[#dcfce7]";
}

function desktopFace(freeCourts: number, players: number): string {
  if (freeCourts < 1) return "lg:border-line lg:bg-transparent";
  if (players > 0) return "lg:border-court lg:bg-transparent";
  return "lg:border-[#2563eb] lg:bg-transparent";
}

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
  const params = useSearchParams();
  const queryDate = params.get("date");
  const queryStart = params.get("start");
  const [week, setWeek] = useState<string | undefined>(queryDate ?? undefined);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [queryApplied, setQueryApplied] = useState(false);
  const board = useResource<Board>(user ? `/courts/board${week ? `?week=${week}` : ""}` : null);

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
    setQueryApplied(true);
  }, [queryApplied, board.data, queryDate, queryStart]);

  function pick(date: string, start: string) {
    flushSync(() => setPicked({ date, start }));
  }

  if (board.loading || !user) return <LoadingBlock label="Takvim yükleniyor" />;
  if (board.error || !board.data) return <ErrorState message={board.error ?? "Takvim açılmadı"} onRetry={() => void board.reload()} />;

  const data = board.data;
  const slot = picked ? data.slots.find((item) => item.date === picked.date && item.startTime === picked.start) ?? null : null;
  const courts = slot ? freeCourtsOf(slot) : [];

  return (
    <div className="flex h-[calc(100dvh-11rem)] w-full min-w-0 flex-col gap-1 overflow-hidden">
      <style>{`
        .takvim-board { grid-template-columns: 2.75rem repeat(7, minmax(0, 1fr)); }
        @media (min-width: 64rem) {
          .takvim-board { grid-template-columns: 3.25rem repeat(7, 6.25rem); }
        }
      `}</style>
      <h1 className="shrink-0 text-sm font-semibold leading-none">Takvim</h1>
      <div className="flex w-full shrink-0 items-center gap-2 text-sm leading-none">
        <button type="button" className="court-press shrink-0 py-0.5" onClick={() => { setWeek(shiftDate(data.weekStart, -7)); setPicked(null); }}>önceki</button>
        <p className="min-w-0 flex-1 text-center text-xs text-muted">{data.days[0]?.date} – {data.days[6]?.date}</p>
        <button type="button" className="court-press shrink-0 py-0.5" onClick={() => { setWeek(shiftDate(data.weekStart, 7)); setPicked(null); }}>sonraki</button>
      </div>
      <div className="flex min-h-0 w-full flex-1 flex-col gap-1.5 lg:flex-row lg:items-stretch">
        <div className="min-h-0 w-full flex-1 lg:h-full lg:w-auto lg:flex-none">
          <div
            className="takvim-board grid h-full w-full gap-x-0.5 gap-y-px lg:w-max lg:gap-0.5"
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
                <div className="flex items-center whitespace-nowrap text-[10px] font-bold leading-none text-ink">{hour}</div>
                {data.days.map((day) => {
                  const cell = data.slots.find((item) => item.date === day.date && item.startTime === hour);
                  if (!cell) return <div key={day.date} className="min-h-0" />;
                  const selected = picked?.date === day.date && picked.start === hour;
                  const freeCourts = freeCourtsOf(cell);
                  return (
                    <button
                      key={day.date}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${day.label} ${hour}`}
                      onClick={() => pick(day.date, hour)}
                      className={`court-press flex h-full min-h-0 w-full min-w-0 flex-row items-center justify-center gap-0.5 overflow-hidden border-2 p-px lg:flex-col lg:justify-center ${phoneFace(freeCourts.length)} ${desktopFace(freeCourts.length, cell.people.length)} ${selected ? "ring-2 ring-ink ring-inset" : ""}`}
                      style={{ borderRadius: 4 }}
                    >
                      {cell.people.length > 0 ? (
                        <User className="h-3 w-3 shrink-0 text-ink lg:hidden" aria-hidden />
                      ) : null}
                      {cell.people.length > 0 || freeCourts.length > 0 ? (
                        <span className="hidden max-h-full min-h-0 w-full flex-wrap content-center items-center justify-center gap-px overflow-hidden lg:flex">
                          {cell.people.map((person) => (
                            <CellPhoto key={person.id} person={person} />
                          ))}
                          {freeCourts.map((court) => (
                            <span key={court.id} className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-line text-[8px] font-semibold leading-none text-ink">
                              {circleLabel(court)}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
        <aside className="h-36 w-full shrink-0 overflow-y-auto lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-1">
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

function openChat(event: MouseEvent, person: SlotPerson) {
  event.stopPropagation();
  if (!person.messageNumber) return;
  window.open(waLink(person.messageNumber, person.firstName), "_blank", "noopener,noreferrer");
}

function CellPhoto({ person }: { person: SlotPerson }) {
  return (
    <span className="inline-flex shrink-0" onClick={(event) => openChat(event, person)}>
      <PersonFace person={person} className="h-3.5 w-3.5 text-[7px]" />
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
  if (!person.messageNumber) return <span className={className}>{body}</span>;
  return (
    <a href={waLink(person.messageNumber, person.firstName)} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  );
}
