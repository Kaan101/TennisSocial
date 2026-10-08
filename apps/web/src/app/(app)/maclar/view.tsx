"use client";

import { WEEKDAYS, formatTrDate, istanbulNowParts } from "@club/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { shiftDate, weekdayOf } from "@/components/court-ui";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useClub } from "@/lib/club";
import { useResource } from "@/lib/use-resource";

type BoardPlayer = {
  userId: string;
  firstName: string;
  lastName: string;
  side: "A" | "B";
  mark: string;
};

type BoardMatch = {
  id: string;
  source: "match" | "offer";
  scheduledAt: string;
  date: string;
  startTime: string;
  status: "SCHEDULED" | "COMPLETED";
  kind: "NORMAL" | "DEFI";
  score: string | null;
  winnerSide: "A" | "B" | null;
  winnerName: string | null;
  players: BoardPlayer[];
};

type BoardDay = { date: string; weekday: number; label: string; short: string };

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
/** Same visible hours as Takvim: 08:00 through 21:00. */
const HOURS = Array.from({ length: 14 }, (_, index) => `${String(8 + index).padStart(2, "0")}:00`);

function mondayOf(date: string): string {
  const weekday = weekdayOf(date);
  return shiftDate(date, weekday === 0 ? -6 : 1 - weekday);
}

function daysOf(weekStart: string): BoardDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(weekStart, index);
    const weekday = weekdayOf(date);
    const known = WEEKDAYS.find((day) => day.value === weekday);
    return { date, weekday, label: known?.label ?? "", short: known?.short ?? "" };
  });
}

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

function istanbulClock(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("hour")}:${pick("minute")}`;
}

function sideNames(players: BoardPlayer[], side: "A" | "B"): string {
  return players
    .filter((player) => player.side === side)
    .map((player) => `${player.firstName} ${player.lastName}`.trim())
    .filter(Boolean)
    .join(", ");
}

function Pairing({ match }: { match: BoardMatch }) {
  const played = match.status === "COMPLETED";
  const sides = (["A", "B"] as const)
    .map((side) => ({ side, label: sideNames(match.players, side) }))
    .filter((item) => item.label);
  if (sides.length === 0) return "Oyuncular";
  return sides.map((item, index) => {
    const won = played && match.winnerSide === item.side;
    return (
      <span key={item.side}>
        {index > 0 ? " – " : null}
        <span className={won ? "font-bold text-court" : undefined}>{item.label}</span>
      </span>
    );
  });
}

/** Full given name, then the surname’s first letter and a dot. “Simona H.” */
function cellName(player: BoardPlayer): string {
  const given = player.firstName.trim();
  const initial = Array.from(player.lastName.trim())[0]?.toLocaleUpperCase("tr-TR") ?? "";
  if (given && initial) return `${given} ${initial}.`;
  return given || (initial ? `${initial}.` : "");
}

function cellLine(match: BoardMatch): string {
  return [...match.players]
    .sort((left, right) => (left.side < right.side ? -1 : left.side > right.side ? 1 : 0))
    .map(cellName)
    .filter(Boolean)
    .join(" · ");
}

export function MaclarView() {
  const { user } = useAuth();
  const { clubId, ready } = useClub();
  const [focus, setFocus] = useState<string | undefined>(undefined);
  const anchor = focus ?? istanbulNowParts().day;
  const weekStart = mondayOf(anchor);
  const days = useMemo(() => daysOf(weekStart), [weekStart]);
  const path = user && ready && clubId ? `/matches/board?club=${encodeURIComponent(clubId)}&week=${weekStart}` : null;
  const { data, error, loading, reload } = useResource<{ matches: BoardMatch[] }>(path);
  const matches = data?.matches;
  const cells = useMemo(() => {
    const map = new Map<string, BoardMatch[]>();
    const daySet = new Set(days.map((day) => day.date));
    const hourSet = new Set(HOURS);
    for (const match of matches ?? []) {
      if (!daySet.has(match.date) || !hourSet.has(match.startTime)) continue;
      const key = `${match.date}|${match.startTime}`;
      const list = map.get(key);
      if (list) list.push(match);
      else map.set(key, [match]);
    }
    return map;
  }, [matches, days]);
  const listed = matches ?? [];
  const today = istanbulNowParts().day;
  const range = weekRange(days[0]?.date ?? "", days[6]?.date ?? "");

  if (ready && !clubId) {
    return <EmptyState title="Kulüp seçilmedi" body="Maçları görmek için üstten bir kulüp seç." />;
  }
  const listPending = !ready || loading;

  return (
    <div className="grid h-[calc(100dvh-11.5rem)] min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 overflow-hidden lg:grid-cols-5 lg:grid-rows-1">
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-surface p-3 lg:col-span-3">
        <div className="shrink-0">
          <h1 className="text-2xl font-semibold tracking-tight">Maçlar</h1>
          <WeekBar
            range={range}
            anchor={anchor}
            onDate={(value) => setFocus(value)}
            onPrev={() => setFocus(shiftDate(anchor, -7))}
            onNext={() => setFocus(shiftDate(anchor, 7))}
            onToday={() => setFocus(undefined)}
          />
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-auto overscroll-contain" aria-label="Haftalık maç ızgarası">
          <WeekGrid days={days} today={today} cells={cells} />
        </div>
      </section>
      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-line bg-surface p-4 lg:col-span-2">
        <h2 className="shrink-0 text-sm font-semibold">
          Tüm maçlar
          {listed.length > 0 ? <span className="ml-2 font-medium text-muted">{listed.length}</span> : null}
        </h2>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {listPending ? <LoadingBlock label="Maçlar yükleniyor" /> : null}
          {!listPending && error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
          {!listPending && !error && listed.length === 0 ? (
            <EmptyState title="Henüz maç yok" body="Planlanan ve oynanan maçlar burada listelenir." />
          ) : null}
          {!listPending && !error && listed.length > 0 ? (
            <ul className="space-y-2" aria-label="Planlı ve oynanan maçlar">
              {listed.map((match) => (
                <MatchRow key={`${match.source}:${match.id}`} match={match} onRefresh={() => reload()} />
              ))}
            </ul>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function WeekBar({
  range,
  anchor,
  onDate,
  onPrev,
  onNext,
  onToday,
}: {
  range: string;
  anchor: string;
  onDate: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" aria-label="Önceki hafta" onClick={onPrev} className="court-press grid h-8 w-8 place-items-center rounded-md border border-line text-sm">
        ‹
      </button>
      <input
        type="date"
        aria-label="Tarih"
        value={anchor}
        onChange={(event) => {
          if (event.target.value) onDate(event.target.value);
        }}
        className="h-8 rounded-md border border-line bg-surface px-2 text-sm"
      />
      <p className="min-w-0 flex-1 text-center text-sm font-semibold">{range}</p>
      <button type="button" aria-label="Sonraki hafta" onClick={onNext} className="court-press grid h-8 w-8 place-items-center rounded-md border border-line text-sm">
        ›
      </button>
      <button type="button" onClick={onToday} className="court-press rounded-md border border-line px-3 py-1 text-sm font-semibold">
        Bugün
      </button>
    </div>
  );
}

function WeekGrid({
  days,
  today,
  cells,
}: {
  days: BoardDay[];
  today: string;
  cells: Map<string, BoardMatch[]>;
}) {
  return (
    <div className="grid min-w-[36rem] gap-1" style={{ gridTemplateColumns: "3.25rem repeat(7, minmax(0, 1fr))" }}>
      <div className="sticky top-0 left-0 z-30 bg-surface px-1 text-[11px] font-semibold text-muted">Saat</div>
      {days.map((day) => {
        const on = day.date === today;
        return (
          <div
            key={day.date}
            className={`sticky top-0 z-20 px-1 py-1 text-center text-[11px] font-semibold leading-tight ${on ? "rounded-lg bg-court text-white" : "bg-surface text-ink"}`}
          >
            {day.short} {Number(day.date.slice(8))}
          </div>
        );
      })}
      {HOURS.map((hour) => (
        <HourRow key={hour} hour={hour} days={days} cells={cells} />
      ))}
    </div>
  );
}

function HourRow({
  hour,
  days,
  cells,
}: {
  hour: string;
  days: BoardDay[];
  cells: Map<string, BoardMatch[]>;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 flex items-center bg-surface text-[11px] text-muted">{hour}</div>
      {days.map((day) => (
        <MatchCell key={day.date} day={day} hour={hour} matches={cells.get(`${day.date}|${hour}`) ?? []} />
      ))}
    </>
  );
}

function MatchCell({ day, hour, matches }: { day: BoardDay; hour: string; matches: BoardMatch[] }) {
  if (matches.length === 0) {
    return <div className="h-11 rounded-lg border border-line lg:h-8" />;
  }
  const lines = matches.map(cellLine).filter(Boolean);
  return (
    <div
      role="group"
      className="flex h-11 flex-col justify-center gap-px overflow-hidden rounded-lg border border-court/40 bg-paper px-0.5 lg:h-8"
      title={lines.join("\n")}
      aria-label={`${day.label} ${hour}, ${lines.join(", ")}`}
    >
      {matches.map((match) => {
        const line = cellLine(match);
        return (
          <p key={`${match.source}:${match.id}`} className="truncate text-[10px] leading-tight font-semibold text-ink" title={line}>
            {line}
          </p>
        );
      })}
    </div>
  );
}

function MatchRow({ match, onRefresh }: { match: BoardMatch; onRefresh: () => Promise<void> }) {
  const played = match.status === "COMPLETED";
  const href = match.source === "match" ? `/maclar/${match.id}` : "/merdiven";
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setFail(null);
    const path = match.source === "offer" ? `/match-offers/${match.id}/cancel` : `/matches/${match.id}/cancel`;
    try {
      await api(path, { method: "POST", body: JSON.stringify({}) });
      await onRefresh();
    } catch (err) {
      setFail(err instanceof Error ? err.message : "Maç iptal edilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-line px-3 py-2 text-sm">
      <div className="flex items-start gap-2">
        <Link href={href} className="block min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 font-semibold">
              <Pairing match={match} />
            </p>
            {played && match.kind === "DEFI" ? (
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-court px-1 text-[11px] font-semibold text-white" title="Defi">
                <span className="sr-only">Defi</span>D
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {formatTrDate(match.scheduledAt)} · {istanbulClock(match.scheduledAt)}
          </p>
        </Link>
        {played ? null : (
          <button
            type="button"
            onClick={() => void cancel()}
            disabled={busy}
            className="court-press mt-0.5 shrink-0 rounded-md border border-line px-2 py-1 text-xs font-semibold disabled:opacity-50"
          >
            İptal
          </button>
        )}
      </div>
      {fail ? <p className="mt-1 text-xs text-clay">{fail}</p> : null}
    </li>
  );
}
