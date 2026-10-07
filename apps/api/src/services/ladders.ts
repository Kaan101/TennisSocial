import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError, notFound } from "../lib/errors";

export async function recordLadderChange(input: {
  ladderId: string;
  userId: string;
  newRank: number;
  newPoints: number;
  reason?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const ladder = await tx.ladder.findFirst({ where: { id: input.ladderId, deletedAt: null } });
    if (!ladder) throw notFound("Merdiven bulunamadı");
    const current = await tx.ladderPlayer.findUnique({
      where: { ladderId_userId: { ladderId: input.ladderId, userId: input.userId } },
    });
    if (current && current.rank !== input.newRank) {
      const occupant = await tx.ladderPlayer.findUnique({
        where: { ladderId_rank: { ladderId: input.ladderId, rank: input.newRank } },
      });
      if (occupant && occupant.userId !== input.userId) {
        await tx.ladderPlayer.update({
          where: { id: occupant.id },
          data: { rank: current.rank },
        });
      }
    }
    const player = current
      ? await tx.ladderPlayer.update({
          where: { id: current.id },
          data: { rank: input.newRank, points: input.newPoints },
        })
      : await tx.ladderPlayer.create({
          data: {
            ladderId: input.ladderId,
            userId: input.userId,
            rank: input.newRank,
            points: input.newPoints,
          },
        });
    const history = await tx.ladderHistory.create({
      data: {
        ladderId: input.ladderId,
        userId: input.userId,
        previousRank: current?.rank ?? null,
        newRank: input.newRank,
        previousPoints: current?.points ?? null,
        newPoints: input.newPoints,
        reason: input.reason,
      },
    });
    return { player, history };
  });
}

export async function assertLadderChallenge(input: { ladderId: string; challengerId: string; recipientId: string }): Promise<void> {
  const ladder = await prisma.ladder.findFirst({ where: { id: input.ladderId, deletedAt: null } });
  if (!ladder) throw notFound("Merdiven bulunamadı");
  const [challenger, recipient] = await Promise.all([
    prisma.ladderPlayer.findUnique({ where: { ladderId_userId: { ladderId: ladder.id, userId: input.challengerId } } }),
    prisma.ladderPlayer.findUnique({ where: { ladderId_userId: { ladderId: ladder.id, userId: input.recipientId } } }),
  ]);
  if (!challenger || !recipient) throw new AppError(400, "VALIDATION_ERROR", "İkiniz de bu merdivende olmalısınız");
  if (recipient.rank >= challenger.rank) {
    throw new AppError(400, "VALIDATION_ERROR", "Yalnızca üst sıradaki bir oyuncuya merdiven defisi atabilirsin");
  }
  if (challenger.rank - recipient.rank > ladder.maxRankSpan) {
    throw new AppError(400, "VALIDATION_ERROR", `Bu oyuncu ${ladder.maxRankSpan} sıra sınırının dışında`);
  }
}

export async function applyLadderChallengeShiftTx(
  tx: Prisma.TransactionClient,
  input: { ladderId: string; challengerId: string; recipientId: string },
): Promise<void> {
  const challenger = await tx.ladderPlayer.findUnique({
    where: { ladderId_userId: { ladderId: input.ladderId, userId: input.challengerId } },
  });
  const recipient = await tx.ladderPlayer.findUnique({
    where: { ladderId_userId: { ladderId: input.ladderId, userId: input.recipientId } },
  });
  if (!challenger || !recipient) throw new AppError(400, "VALIDATION_ERROR", "İki oyuncu aynı merdivende değil");
  const fromRank = challenger.rank;
  const toRank = recipient.rank;
  if (fromRank <= toRank) throw new AppError(400, "VALIDATION_ERROR", "Defi sıralaması geçersiz");

  await tx.ladderPlayer.update({ where: { id: challenger.id }, data: { rank: 1_000_000 } });
  const bumped = await tx.ladderPlayer.findMany({
    where: { ladderId: input.ladderId, rank: { gte: toRank, lt: fromRank } },
    orderBy: { rank: "desc" },
  });
  for (const row of bumped) {
    await tx.ladderPlayer.update({
      where: { id: row.id },
      data: { rank: row.rank + 1, lastMove: "DOWN" },
    });
  }
  const challengerPoints = challenger.points + 3;
  await tx.ladderPlayer.update({
    where: { id: challenger.id },
    data: { rank: toRank, points: challengerPoints, lastMove: "UP" },
  });
  await tx.ladderHistory.createMany({
    data: [
      {
        ladderId: input.ladderId,
        userId: input.challengerId,
        previousRank: fromRank,
        newRank: toRank,
        previousPoints: challenger.points,
        newPoints: challengerPoints,
        reason: "Merdiven defi kazandı",
      },
      {
        ladderId: input.ladderId,
        userId: input.recipientId,
        previousRank: toRank,
        newRank: toRank + 1,
        previousPoints: recipient.points,
        newPoints: recipient.points,
        reason: "Merdiven defi kaybetti",
      },
    ],
  });
}

export async function applyLadderChallengeShift(input: {
  ladderId: string;
  challengerId: string;
  recipientId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => applyLadderChallengeShiftTx(tx, input));
}

export async function applyLadderMatchResult(input: { ladderId: string; winnerId: string; loserId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ladder = await tx.ladder.findFirst({ where: { id: input.ladderId, deletedAt: null } });
    if (!ladder) throw notFound("Merdiven bulunamadı");
    const winner = await tx.ladderPlayer.findUnique({
      where: { ladderId_userId: { ladderId: input.ladderId, userId: input.winnerId } },
    });
    const loser = await tx.ladderPlayer.findUnique({
      where: { ladderId_userId: { ladderId: input.ladderId, userId: input.loserId } },
    });
    if (!winner || !loser) return;
    if (winner.rank <= loser.rank) {
      await tx.ladderHistory.create({
        data: {
          ladderId: input.ladderId,
          userId: input.winnerId,
          previousRank: winner.rank,
          newRank: winner.rank,
          previousPoints: winner.points,
          newPoints: winner.points,
          reason: "Merdiven maçı, sıra değişmedi",
        },
      });
      return;
    }
    const winnerRank = winner.rank;
    const loserRank = loser.rank;
    const winnerPoints = winner.points + 3;
    await tx.ladderPlayer.update({ where: { id: winner.id }, data: { rank: 100000 } });
    await tx.ladderPlayer.update({ where: { id: loser.id }, data: { rank: winnerRank } });
    await tx.ladderPlayer.update({ where: { id: winner.id }, data: { rank: loserRank, points: winnerPoints } });
    await tx.ladderHistory.createMany({
      data: [
        {
          ladderId: input.ladderId,
          userId: input.winnerId,
          previousRank: winnerRank,
          newRank: loserRank,
          previousPoints: winner.points,
          newPoints: winnerPoints,
          reason: "Merdiven maçı",
        },
        {
          ladderId: input.ladderId,
          userId: input.loserId,
          previousRank: loserRank,
          newRank: winnerRank,
          previousPoints: loser.points,
          newPoints: loser.points,
          reason: "Merdiven maçı",
        },
      ],
    });
    await tx.activityEvent.createMany({
      data: [
        {
          actorId: input.winnerId,
          type: "LADDER_RANK_CHANGE",
          title: "Merdiven sırası yükseldi",
          body: `${winnerRank}. sıradan ${loserRank}. sıraya`,
          link: "/merdiven",
        },
        {
          actorId: input.loserId,
          type: "LADDER_RANK_CHANGE",
          title: "Merdiven sırası değişti",
          body: `${loserRank}. sıradan ${winnerRank}. sıraya`,
          link: "/merdiven",
        },
      ],
    });
  });
}
