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

function manualState(windows: WindowRow[], date: string, weekday: number, startTime: string): AvailabilityState | null {
  const endTime = slotEnd(startTime);
  const overlaps = (window: WindowRow) => timesOverlap(window.startTime, window.endTime, startTime, endTime);
  const oneOffs = windows.filter((window) => window.kind === "ONE_OFF" && dateOnly(window.date) === date && overlaps(window));
  if (oneOffs.length > 0) {
    const exact = oneOffs.find((window) => window.startTime === startTime && window.endTime === endTime);
    return (exact ?? oneOffs[0])?.state ?? null;
  }
  const weekly = windows.find((window) => window.kind === "WEEKLY" && window.weekday === weekday && overlaps(window));
  return weekly?.state ?? null;
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
        manual: manualState(windows, date, weekday, startTime),
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

export async function paintAvailabilityCell(userId: string, input: { date: string; startTime: string; state: AvailabilityState }) {
  if (!COURT_HOURS.includes(input.startTime)) {
    throw new AppError(400, "VALIDATION_ERROR", "Saat 08:00 ile 22:00 arasında olmalı");
  }
  const endTime = slotEnd(input.startTime);
  const weekday = weekdayOfDate(input.date);
  const matches = await prisma.courtReservation.findMany({
    where: {
      deletedAt: null,
      purpose: "MATCH",
      status: { in: ["PENDING", "APPROVED"] },
      OR: [{ holderId: userId }, { partnerId: userId }],
      startDate: { lte: parseDateOnly(input.date) },
      endDate: { gte: parseDateOnly(input.date) },
    },
    select: { startDate: true, endDate: true, weekdays: true, startTime: true, endTime: true },
  });
  const booked = matches.some((row) => slotCoveredBySpan(input.date, input.startTime, {
    startDate: dateOnly(row.startDate) ?? input.date,
    endDate: dateOnly(row.endDate) ?? input.date,
    weekdays: row.weekdays,
    startTime: row.startTime,
    endTime: row.endTime,
  }));
  if (booked) throw new AppError(409, "CONFLICT", "Bu saatte maçın var");

  const date = parseDateOnly(input.date);
  const existing = await prisma.availability.findMany({
    where: {
      userId,
      deletedAt: null,
      kind: "ONE_OFF",
      date,
      startTime: input.startTime,
      endTime,
    },
    select: { id: true },
  });
  if (existing.length > 0) {
    await prisma.availability.updateMany({
      where: { id: { in: existing.map((row) => row.id) } },
      data: { state: input.state },
    });
  } else {
    await prisma.availability.create({
      data: {
        userId,
        kind: "ONE_OFF",
        date,
        weekday,
        startTime: input.startTime,
        endTime,
        state: input.state,
      },
    });
  }
  return { ok: true, date: input.date, startTime: input.startTime, state: input.state };
}
