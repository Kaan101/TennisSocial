import type { PlayerStatus } from "@club/shared";
import { isPlayableStatus } from "../lib/privacy";

export type WindowRow = {
  kind: "WEEKLY" | "ONE_OFF";
  weekday: number | null;
  date: string | null;
  startTime: string;
  endTime: string;
  note: string | null;
};

export function isAvailableOn(
  input: {
    status: PlayerStatus | string;
    windows: WindowRow[];
    absences: { startDate: string; endDate: string }[];
  },
  day: string,
  weekday: number,
): boolean {
  if (!isPlayableStatus(input.status)) return false;
  if (input.absences.some((absence) => day >= absence.startDate && day <= absence.endDate)) return false;
  return input.windows.some((window) => {
    if (window.kind === "ONE_OFF") return window.date === day;
    return window.weekday === weekday;
  });
}

export function hasWeekendWindow(windows: WindowRow[]): boolean {
  return windows.some((window) => window.kind === "WEEKLY" && (window.weekday === 0 || window.weekday === 6));
}
