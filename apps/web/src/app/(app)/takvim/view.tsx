"use client";

import { Fragment, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import { type CourtCell, type Slot, type SlotPerson, fullName, shiftDate } from "@/components/court-ui";
import { Avatar } from "@/components/player-card";
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
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <h1 className="text-sm font-semibold">Takvim</h1>
      <div className="flex w-full min-w-0 items-center gap-3 text-sm">
        <button type="button" className="court-press shrink-0 py-1" onClick={() => { setWeek(shiftDate(data.weekStart, -7)); setPicked(null); }}>önceki</button>
        <p className="min-w-0 flex-1 text-center text-xs text-muted">{data.days[0]?.date} – {data.days[6]?.date}</p>
        <button type="button" className="court-press shrink-0 py-1" onClick={() => { setWeek(shiftDate(data.weekStart, 7)); setPicked(null); }}>sonraki</button>
      </div>
      <div className="grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 overflow-x-auto lg:col-span-2">
          <div
            className="grid w-max gap-0.5"
            style={{ gridTemplateColumns: "3.25rem repeat(7, 7.25rem)" }}
          >
            <div />
            {data.days.map((day) => (
              <div key={day.date} className="whitespace-nowrap px-1 pb-1 text-center text-[10px] font-semibold leading-tight md:text-xs">
                <span className="md:hidden">{day.short}</span>
                <span className="hidden md:inline">{day.label}</span>
                <span className="mt-0.5 block font-normal text-muted">{day.date.slice(8)}</span>
              </div>
            ))}
            {data.hours.map((hour) => (
              <Fragment key={hour}>
                <div className="py-1 text-[10px] font-bold text-ink">{hour}</div>
                {data.days.map((day) => {
                  const cell = data.slots.find((item) => item.date === day.date && item.startTime === hour);
                  if (!cell) return <div key={day.date} />;
                  const selected = picked?.date === day.date && picked.start === hour;
                  const freeCourts = freeCourtsOf(cell);
                  const open = freeCourts.length > 0;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${day.label} ${hour}`}
                      onClick={() => pick(day.date, hour)}
                      className={`court-press flex min-h-8 w-full flex-wrap content-start items-center gap-0.5 border-2 p-0.5 ${open ? "border-court bg-surface" : "border-line bg-surface"} ${selected ? "ring-2 ring-ink ring-inset" : ""}`}
                      style={{ borderRadius: 4 }}
                    >
                      {cell.people.map((person) => (
                        <CellPhoto key={person.id} person={person} />
                      ))}
                      {freeCourts.map((court) => (
                        <span key={court.id} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[9px] font-semibold leading-none text-ink">
                          {circleLabel(court)}
                        </span>
                      ))}
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
        <aside className="min-w-0 space-y-4 lg:col-span-1">
          {slot ? (
            <>
              <section>
                <h2 className="text-sm font-semibold">Oyuncular</h2>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {slot.people.map((person) => (
                    <li key={person.id} className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1">
                      <Avatar first={person.firstName} last={person.lastName} photo={person.photoUrl} className="h-8 w-8" />
                      <span className="text-sm">{fullName(person)}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h2 className="text-sm font-semibold">Kortlar</h2>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {courts.map((court) => (
                    <li key={court.id} className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink">
                      {panelCourtName(court)}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function CellPhoto({ person }: { person: SlotPerson }) {
  if (person.photoUrl) {
    return <img src={person.photoUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />; // eslint-disable-line @next/next/no-img-element
  }
  const letters = `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toLocaleUpperCase("tr-TR");
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-court-deep text-[8px] font-semibold leading-none text-white">
      {letters}
    </span>
  );
}
