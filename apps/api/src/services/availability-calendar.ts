import type { AvailabilityState } from "@club/shared";
import { WEEKDAYS, istanbulNowParts } from "@club/shared";
import { dateOnly, parseDateOnly } from "../lib/dates";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { COURT_HOURS, clockHour, mondayOf, slotEnd, weekDates, weekdayOfDate } from "./courts/rules";

/** Live one-off that blocks a weekly window for this date and hour. The grid stays blank. */
export const CLOSED_HOUR_NOTE = "closed-hour";

export type CalendarCell = {
  date: string;
  startTime: string;
  manual: AvailabilityState | null;
};

type WindowRow = {
  kind: "WEEKLY" | "ONE_OFF";
  weekday: number | null;
  date: Date | null;
  startTime: string;
  endTime: string;
  state: AvailabilityState;
  note?: string | null;
};

function preferredState(states: AvailabilityState[]): AvailabilityState {
  if (states.includes("FULL")) return "FULL";
  if (states.includes("MAYBE")) return "MAYBE";
  return "BUSY";
}

function exactMarks(windows: WindowRow[]): Map<string, AvailabilityState> {
  const grouped = new Map<string, AvailabilityState[]>();
  for (const window of windows) {
    if (window.kind !== "ONE_OFF") continue;
    if (window.note === CLOSED_HOUR_NOTE) continue;
    const date = dateOnly(window.date);
    const startTime = clockHour(window.startTime);
    if (!date || clockHour(window.endTime) !== slotEnd(startTime)) continue;
    const key = `${date}|${startTime}`;
    const states = grouped.get(key);
    if (states) states.push(window.state);
    else grouped.set(key, [window.state]);
  }
  const marks = new Map<string, AvailabilityState>();
  for (const [key, states] of grouped) marks.set(key, preferredState(states));
  return marks;
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
  const windows = await prisma.availability.findMany({
    where: { userId, deletedAt: null },
    select: { kind: true, weekday: true, date: true, startTime: true, endTime: true, state: true, note: true },
  });

  const marks = exactMarks(windows);
  const cells: CalendarCell[] = dates.flatMap((date) => COURT_HOURS.map((startTime) => ({
    date,
    startTime,
    manual: marks.get(`${date}|${startTime}`) ?? null,
  })));

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

async function exactHourRows(userId: string, date: string, startTime: string) {
  const endTime = slotEnd(startTime);
  const rows = await prisma.availability.findMany({
    where: { userId, deletedAt: null, kind: "ONE_OFF", date: parseDateOnly(date) },
    select: { id: true, startTime: true, endTime: true },
  });
  return rows.filter((row) => clockHour(row.startTime) === startTime && clockHour(row.endTime) === endTime);
}

async function writeExactHour(userId: string, date: string, startTime: string, state: AvailabilityState) {
  const endTime = slotEnd(startTime);
  const existing = await exactHourRows(userId, date, startTime);
  if (existing.length > 0) {
    await prisma.availability.updateMany({
      where: { id: { in: existing.map((row) => row.id) } },
      data: { state, startTime, endTime, note: null },
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
      note: null,
    },
  });
}

async function closeExactHour(userId: string, date: string, startTime: string) {
  const endTime = slotEnd(startTime);
  const existing = await exactHourRows(userId, date, startTime);
  if (existing.length > 0) {
    await prisma.availability.updateMany({
      where: { id: { in: existing.map((row) => row.id) } },
      data: { state: "BUSY", note: CLOSED_HOUR_NOTE, startTime, endTime },
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
      state: "BUSY",
      note: CLOSED_HOUR_NOTE,
    },
  });
}

export async function paintAvailabilityCell(userId: string, input: { date: string; startTime: string; state: AvailabilityState | null }) {
  if (!COURT_HOURS.includes(input.startTime)) {
    throw new AppError(400, "VALIDATION_ERROR", "Saat 08:00 ile 22:00 arasında olmalı");
  }
  if (input.state === null) {
    await closeExactHour(userId, input.date, input.startTime);
    return { ok: true, date: input.date, startTime: input.startTime, state: null };
  }
  await writeExactHour(userId, input.date, input.startTime, input.state);
  return { ok: true, date: input.date, startTime: input.startTime, state: input.state };
}

export async function copyAvailabilityMonth(userId: string, month: string) {
  const source = monthBounds(month);
  const targetKey = nextMonthKey(month);
  const target = monthBounds(targetKey);
  const marks = await prisma.availability.findMany({
    where: {
      userId,
      deletedAt: null,
      kind: "ONE_OFF",
      date: { gte: parseDateOnly(source.start), lte: parseDateOnly(source.end) },
    },
    select: { date: true, startTime: true, endTime: true, state: true, note: true },
  });
  let copied = 0;
  for (const mark of marks) {
    const date = dateOnly(mark.date);
    const startTime = clockHour(mark.startTime);
    if (!date || !COURT_HOURS.includes(startTime) || clockHour(mark.endTime) !== slotEnd(startTime)) continue;
    const nextDate = sameWeekdayNextMonth(date);
    if (!nextDate || nextDate < target.start || nextDate > target.end) continue;
    if (mark.note === CLOSED_HOUR_NOTE) await closeExactHour(userId, nextDate, startTime);
    else await writeExactHour(userId, nextDate, startTime, mark.state);
    copied += 1;
  }
  return { ok: true, month, nextMonth: targetKey, copied };
}
