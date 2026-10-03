import { levelIndex, type OverallLevel } from "@club/shared";

export const CHECK_IN_LEAD_KEY = "checkInLeadHours";
export const DEFAULT_CHECK_IN_LEAD_HOURS = 3;
export const COURT_OPEN = "08:00";
export const COURT_CLOSE = "23:00";
export const MAX_RANGE_DAYS = 366;

export const COURT_HOURS: string[] = Array.from({ length: 15 }, (_, index) => {
  const hour = 8 + index;
  return `${String(hour).padStart(2, "0")}:00`;
});

export type Span = {
  startDate: string;
  endDate: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
};

export function slotEnd(startTime: string): string {
  const hour = Number(startTime.slice(0, 2)) + 1;
  return `${String(hour).padStart(2, "0")}:00`;
}

/** "14:00:00" and "14:00" are the same court hour. */
export function clockHour(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
}

export function weekdayOfDate(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function inclusiveDayCount(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00.000Z`);
  const to = Date.parse(`${end}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

export function mondayOf(date: string): string {
  const weekday = weekdayOfDate(date);
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, delta);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  for (let index = 0; index < MAX_RANGE_DAYS; index += 1) {
    dates.push(cursor);
    if (cursor === end) return dates;
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function rangeHitsWeekdays(start: string, end: string, weekdays: number[]): boolean {
  const wanted = new Set(weekdays);
  return eachDate(start, end).some((date) => wanted.has(weekdayOfDate(date)));
}

export function spansOverlap(a: Span, b: Span): boolean {
  if (!timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) return false;
  const start = a.startDate > b.startDate ? a.startDate : b.startDate;
  const end = a.endDate < b.endDate ? a.endDate : b.endDate;
  if (start > end) return false;
  const shared = new Set(a.weekdays.filter((day) => b.weekdays.includes(day)));
  if (shared.size === 0) return false;
  return eachDate(start, end).some((date) => shared.has(weekdayOfDate(date)));
}

export function slotCoveredBySpan(date: string, startTime: string, span: Span): boolean {
  if (date < span.startDate || date > span.endDate) return false;
  if (!span.weekdays.includes(weekdayOfDate(date))) return false;
  return timesOverlap(startTime, slotEnd(startTime), span.startTime, span.endTime);
}

export function slotIsGreen(levelIndexes: number[]): boolean {
  if (levelIndexes.length < 2) return false;
  for (let left = 0; left < levelIndexes.length; left += 1) {
    for (let right = left + 1; right < levelIndexes.length; right += 1) {
      if (Math.abs(levelIndexes[left]! - levelIndexes[right]!) <= 1) return true;
    }
  }
  return false;
}

export function levelIndexesOf(levels: OverallLevel[]): number[] {
  return levels.map((level) => levelIndex(level));
}

export function slotStartInstant(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime}:00+03:00`);
}

/** End is exclusive: 18:00–21:00 is the slots 18, 19, and 20. */
export function hoursInRange(startTime: string, endTime: string): string[] {
  const start = Number(startTime.slice(0, 2));
  const end = Number(endTime.slice(0, 2));
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return [];
  const hours: string[] = [];
  for (let hour = start; hour < end; hour += 1) {
    hours.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return hours;
}

export function isHourRange(startTime: string, endTime: string): boolean {
  const hours = hoursInRange(startTime, endTime);
  if (hours.length === 0 || endTime > COURT_CLOSE) return false;
  return hours.every((hour) => COURT_HOURS.includes(hour));
}
