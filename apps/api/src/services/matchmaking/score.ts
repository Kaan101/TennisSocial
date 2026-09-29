import { levelIndex, type OverallLevel, type PlayPreference, type PreferredTime, type SkillName } from "@club/shared";
import { windowsOverlap } from "../../lib/dates";

export type ScoreProfile = {
  userId: string;
  overallLevel: OverallLevel;
  skills: Partial<Record<SkillName, number>>;
  weekly: { weekday: number; startTime: string; endTime: string }[];
  district: string | null;
  playPreference: PlayPreference;
  preferredPlayTimes: PreferredTime[];
  pastMatchCount: number;
};

export type ScoreResult = { score: number; reasons: string[] };

const SKILL_KEYS: SkillName[] = ["FOREHAND", "BACKHAND", "SERVE", "RETURN", "VOLLEY", "CONSISTENCY"];

export function scoreOpponent(viewer: ScoreProfile, candidate: ScoreProfile): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  const levelGap = Math.abs(levelIndex(viewer.overallLevel) - levelIndex(candidate.overallLevel));
  if (levelGap === 0) {
    score += 25;
    reasons.push("Aynı seviye");
  } else if (levelGap === 1) {
    score += 18;
    reasons.push("Yakın seviye");
  } else if (levelGap === 2) {
    score += 8;
  }

  const diffs: number[] = [];
  for (const skill of SKILL_KEYS) {
    const a = viewer.skills[skill];
    const b = candidate.skills[skill];
    if (a !== undefined && b !== undefined) diffs.push(Math.abs(a - b));
  }
  if (diffs.length) {
    const avg = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
    const skillScore = Math.max(0, Math.round(20 - avg * 4));
    score += skillScore;
    if (avg <= 1.5) reasons.push("Yakın vuruş seviyesi");
  }

  let overlaps = 0;
  for (const left of viewer.weekly) {
    for (const right of candidate.weekly) {
      if (left.weekday === right.weekday && windowsOverlap(left.startTime, left.endTime, right.startTime, right.endTime)) {
        overlaps += 1;
      }
    }
  }
  if (overlaps > 0) {
    score += Math.min(20, overlaps * 5);
    reasons.push("Müsaitlik örtüşüyor");
  }

  if (viewer.district && candidate.district && viewer.district.toLocaleLowerCase("tr-TR") === candidate.district.toLocaleLowerCase("tr-TR")) {
    score += 15;
    reasons.push("Aynı semt");
  }

  if (viewer.pastMatchCount > 0 && viewer.pastMatchCount <= 5) {
    score += 8;
    reasons.push("Daha önce oynadınız");
  } else if (viewer.pastMatchCount > 5) {
    score += 4;
    reasons.push("Sık rakipsiniz");
  }

  const preferenceOk =
    viewer.playPreference === "BOTH" ||
    candidate.playPreference === "BOTH" ||
    viewer.playPreference === candidate.playPreference;
  if (preferenceOk) {
    score += 10;
    reasons.push(viewer.playPreference === "DOUBLES" ? "Çiftler uyumu" : "Oyun tercihi uyuyor");
  }

  const sharedTimes = viewer.preferredPlayTimes.filter((time) => candidate.preferredPlayTimes.includes(time));
  if (sharedTimes.length) {
    score += 10;
    reasons.push("Tercih edilen saat uyuyor");
  }

  if (reasons.length === 0) reasons.push("Genel uyum");
  return { score, reasons };
}
