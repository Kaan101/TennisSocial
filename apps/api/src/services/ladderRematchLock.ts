import type { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";

/** Rank gap at defi time: challenger rank minus recipient rank (1 = one rank above). */
export function ladderChallengeRankGap(challengerRank: number, recipientRank: number): number {
  return challengerRank - recipientRank;
}

export async function listRematchLockedOpponentIds(
  ladderId: string,
  challengerUserId: string,
): Promise<string[]> {
  const rows = await prisma.ladderRematchLock.findMany({
    where: { ladderId, challengerUserId },
    select: { lockedOpponentId: true },
  });
  return rows.map((row) => row.lockedOpponentId);
}

export async function assertRematchNotLocked(
  tx: Prisma.TransactionClient,
  input: { ladderId: string; challengerUserId: string; opponentUserId: string },
): Promise<void> {
  const locked = await tx.ladderRematchLock.findUnique({
    where: {
      ladderId_challengerUserId_lockedOpponentId: {
        ladderId: input.ladderId,
        challengerUserId: input.challengerUserId,
        lockedOpponentId: input.opponentUserId,
      },
    },
  });
  if (locked) {
    throw new AppError(400, "VALIDATION_ERROR", "Bu oyuncuya henüz yeni defi gönderemezsin");
  }
}

/** Apply rematch lock/clear when a ladder defi result is finalized (before rank shift). */
export async function applyRematchLockRulesTx(
  tx: Prisma.TransactionClient,
  offer: { ladderId: string | null; fromUserId: string; toUserId: string; proposedWinnerId: string },
): Promise<void> {
  if (!offer.ladderId) return;
  const ladderId = offer.ladderId;
  const challengerId = offer.fromUserId;
  const opponentId = offer.toUserId;
  const [challenger, opponent] = await Promise.all([
    tx.ladderPlayer.findUnique({ where: { ladderId_userId: { ladderId, userId: challengerId } } }),
    tx.ladderPlayer.findUnique({ where: { ladderId_userId: { ladderId, userId: opponentId } } }),
  ]);
  if (!challenger || !opponent) return;
  const gap = ladderChallengeRankGap(challenger.rank, opponent.rank);
  if (gap === 1) {
    await tx.ladderRematchLock.deleteMany({ where: { ladderId, challengerUserId: challengerId } });
    return;
  }
  const challengerLost = offer.proposedWinnerId !== challengerId;
  if (challengerLost && (gap === 2 || gap === 3)) {
    await tx.ladderRematchLock.upsert({
      where: {
        ladderId_challengerUserId_lockedOpponentId: {
          ladderId,
          challengerUserId: challengerId,
          lockedOpponentId: opponentId,
        },
      },
      create: { ladderId, challengerUserId: challengerId, lockedOpponentId: opponentId },
      update: {},
    });
  }
}
