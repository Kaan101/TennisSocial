import type { LadderContactVisibility } from "./constants";

export const DEFAULT_LADDER_MAX_RANK_SPAN = 3;

/** Merdiven accordion: which contact buttons others see for this row player. */
export function ladderMerdivenContactSlots(
  visibility: LadderContactVisibility,
  playerInOpenDefi: boolean,
): { showCall: boolean; showMessage: boolean } {
  if (visibility === "MESSAGE_ONLY") {
    return { showCall: false, showMessage: true };
  }
  if (visibility === "DEFI_ONLY") {
    if (!playerInOpenDefi) return { showCall: false, showMessage: false };
    return { showCall: true, showMessage: true };
  }
  return { showCall: true, showMessage: true };
}

/** Ayarlar value when missing/invalid; otherwise the saved ladder setting. */
export function effectiveLadderMaxRankSpan(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return DEFAULT_LADDER_MAX_RANK_SPAN;
}

/** Lower rank number is better; gap 1..maxRankSpan (inclusive) is valid upward reach. */
export function isWithinLadderChallengeSpan(
  challengerRank: number,
  recipientRank: number,
  maxRankSpan: number,
): boolean {
  const span = effectiveLadderMaxRankSpan(maxRankSpan);
  const gap = challengerRank - recipientRank;
  return gap >= 1 && gap <= span;
}
