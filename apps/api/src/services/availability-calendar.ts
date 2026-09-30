import type { AvailabilityState } from "@club/shared";
import { WEEKDAYS, istanbulNowParts } from "@club/shared";
import { dateOnly, parseDateOnly } from "../lib/dates";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { COURT_HOURS, mondayOf, slotCoveredBySpan, slotEnd, timesOverlap, weekDates, weekdayOfDate, type Span } from "./courts/rules";

export type CalendarCell = {
  date: string;
  startTime: string;
  manual: AvailabilityState | null;
  match: boolean;
};

type WindowRow = {
  kind: "WEEKLY" | "ONE_OFF";
  weekday: number | null;
  date: Date | null;
  startTime: string;
  endTime: string;
  state: AvailabilityState;
};

function paintedState(windows: WindowRow[], date: string, startTime: string): AvailabilityState | null {
  const endTime = slotEnd(startTime);
  const exact = windows.find((window) => window.kind === "ONE_OFF" && dateOnly(window.date) === date && window.startTime === startTime && window.endTime === endTime);
  return exact?.state ?? null;
}

export function sameWeekdayNextMonth(date: string): string | null {
  const [yearText, monthText, dayText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return null;
  const weekday = weekdayOfDate(date);
  const ordinal = Math.floor((day - 1) / 7) + 1;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const firstWeekday = weekdayOfDate(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`);
  const delta = (weekday - firstWeekday + 7) % 7;
  const targetDay = 1 + delta + (ordinal - 1) * 7;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  if (targetDay > lastDay) return null;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function monthBounds(month: string): { start: string; end: string } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const mm = String(monthNumber).padStart(2, "0");
  return { start: `${yearText}-${mm}-01`, end: `${yearText}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

function nextMonthKey(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (monthNumber === 12) return `${year + 1}-01`;
  return `${yearText}-${String(monthNumber + 1).padStart(2, "0")}`;
}

export async function availabilityWeek(userId: string, weekInput?: string) {
  const today = istanbulNowParts().day;
  const weekStart = mondayOf(weekInput ?? today);
  const dates = weekDates(weekStart);
  const weekEnd = dates[6]!;
  const [windows, matches] = await Promise.all([
    prisma.availability.findMany({
      where: { userId, deletedAt: null },
      select: { kind: true, weekday: true, date: true, startTime: true, endTime: true, state: true },
    }),
    prisma.courtReservation.findMany({
      where: {
        deletedAt: null,
        purpose: "MATCH",
        status: { in: ["PENDING", "APPROVED"] },
        OR: [{ holderId: userId }, { partnerId: userId }],
        startDate: { lte: parseDateOnly(weekEnd) },
        endDate: { gte: parseDateOnly(weekStart) },
      },
      select: { startDate: true, endDate: true, weekdays: true, startTime: true, endTime: true },
    }),
  ]);

  const cells: CalendarCell[] = dates.flatMap((date) => {
    const weekday = weekdayOfDate(date);
    return COURT_HOURS.map((startTime) => {
      const span: Span = {
        startDate: date,
        endDate: date,
        weekdays: [weekday],
        startTime,
        endTime: slotEnd(startTime),
      };
      const match = matches.some((row) => slotCoveredBySpan(date, startTime, {
        startDate: dateOnly(row.startDate) ?? date,
        endDate: dateOnly(row.endDate) ?? date,
        weekdays: row.weekdays,
        startTime: row.startTime,
        endTime: row.endTime,
      }) && timesOverlap(row.startTime, row.endTime, span.startTime, span.endTime));
      return {
        date,
        startTime,
        manual: paintedState(windows, date, startTime),
        match,
      };
    });
  });

  return {
    weekStart,
    hours: COURT_HOURS,
    days: dates.map((date) => {
      const weekday = weekdayOfDate(date);
      const known = WEEKDAYS.find((day) => day.value === weekday);
      return { date, weekday, label: known?.label ?? "", short: known?.short ?? "" };
    }),
    cells,
  };
}

async function hasMatch(userId: string, date: string, startTime: string): Promise<boolean> {
  const matches = await prisma.courtReservation.findMany({
    where: {
      deletedAt: null,
      purpose: "MATCH",
      status: { in: ["PENDING", "APPROVED"] },
      OR: [{ holderId: userId }, { partnerId: userId }],
      startDate: { lte: parseDateOnly(date) },
      endDate: { gte: parseDateOnly(date) },
    },
    select: { startDate: true, endDate: true, weekdays: true, startTime: true, endTime: true },
  });
  return matches.some((row) => slotCoveredBySpan(date, startTime, {
    startDate: dateOnly(row.startDate) ?? date,
    endDate: dateOnly(row.endDate) ?? date,
    weekdays: row.weekdays,
    startTime: row.startTime,
    endTime: row.endTime,
  }));
}

async function writeExactHour(userId: string, date: string, startTime: string, state: AvailabilityState) {
  const endTime = slotEnd(startTime);
  const existing = await prisma.availability.findMany({
    where: {
      userId,
      deletedAt: null,
      kind: "ONE_OFF",
      date: parseDateOnly(date),
      startTime,
      endTime,
    },
    select: { id: true },
  });
  if (existing.length > 0) {
    await prisma.availability.updateMany({
      where: { id: { in: existing.map((row) => row.id) } },
      data: { state },
    });
    return;
  }
  await prisma.availability.create({
    data: {
      userId,
      kind: "ONE_OFF",
      date: parseDateOnly(date),
      weekday: weekdayOfDate(date),
      startTime,
      endTime,
      state,
    },
  });
}

export async function paintAvailabilityCell(userId: string, input: { date: string; startTime: string; state: AvailabilityState | null }) {
  if (!COURT_HOURS.includes(input.startTime)) {
    throw new AppError(400, "VALIDATION_ERROR", "Saat 08:00 ile 22:00 arasında olmalı");
  }
  if (await hasMatch(userId, input.date, input.startTime)) throw new AppError(409, "CONFLICT", "Bu saatte maçın var");
  const endTime = slotEnd(input.startTime);
  if (input.state === null) {
    await prisma.availability.updateMany({
      where: {
        userId,
        deletedAt: null,
        kind: "ONE_OFF",
        date: parseDateOnly(input.date),
        startTime: input.startTime,
        endTime,
      },
      data: { deletedAt: new Date() },
    });
    return { ok: true, date: input.date, startTime: input.startTime, state: null };
  }
  await writeExactHour(userId, input.date, input.startTime, input.state);
  return { ok: true, date: input.date, startTime: input.startTime, state: input.state };
}

type MatchRow = { startDate: Date; endDate: Date; weekdays: number[]; startTime: string; endTime: string };

function rowMatches(rows: MatchRow[], date: string, startTime: string): boolean {
  return rows.some((row) => slotCoveredBySpan(date, startTime, {
    startDate: dateOnly(row.startDate) ?? date,
    endDate: dateOnly(row.endDate) ?? date,
    weekdays: row.weekdays,
    startTime: row.startTime,
    endTime: row.endTime,
  }));
}

export async function copyAvailabilityMonth(userId: string, month: string) {
  const source = monthBounds(month);
  const targetKey = nextMonthKey(month);
  const target = monthBounds(targetKey);
  const [marks, matches] = await Promise.all([
    prisma.availability.findMany({
      where: {
        userId,
        deletedAt: null,
        kind: "ONE_OFF",
        date: { gte: parseDateOnly(source.start), lte: parseDateOnly(source.end) },
      },
      select: { date: true, startTime: true, endTime: true, state: true },
    }),
    prisma.courtReservation.findMany({
      where: {
        deletedAt: null,
        purpose: "MATCH",
        status: { in: ["PENDING", "APPROVED"] },
        OR: [{ holderId: userId }, { partnerId: userId }],
        startDate: { lte: parseDateOnly(target.end) },
        endDate: { gte: parseDateOnly(source.start) },
      },
      select: { startDate: true, endDate: true, weekdays: true, startTime: true, endTime: true },
    }),
  ]);
  let copied = 0;
  for (const mark of marks) {
    const date = dateOnly(mark.date);
    if (!date || !COURT_HOURS.includes(mark.startTime) || mark.endTime !== slotEnd(mark.startTime)) continue;
    if (rowMatches(matches, date, mark.startTime)) continue;
    const nextDate = sameWeekdayNextMonth(date);
    if (!nextDate || nextDate < target.start || nextDate > target.end) continue;
    if (rowMatches(matches, nextDate, mark.startTime)) continue;
    await writeExactHour(userId, nextDate, mark.startTime, mark.state);
    copied += 1;
  }
  return { ok: true, month, nextMonth: targetKey, copied };
}
