import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { applyOfferWinnerTx } from "./ladders";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SCHEDULE_HOURS = 72;
const RESULT_CONFIRM_HOURS = 24;
const COOLDOWN_DAYS = 7;
const MATCH_WINDOW_DAYS = 10;

export type LadderTiming = { acceptDays: number; responseHours: number };

export function offerTimingFor(
  offer: { ladderId: string | null },
  acceptDaysByLadder: Map<string, number>,
  responseHoursByLadder: Map<string, number>,
  fallback: LadderTiming,
): LadderTiming {
  if (!offer.ladderId) return fallback;
  return {
    acceptDays: acceptDaysByLadder.get(offer.ladderId) ?? fallback.acceptDays,
    responseHours: responseHoursByLadder.get(offer.ladderId) ?? fallback.responseHours,
  };
}

export function offerStillActive(
  offer: {
    winnerId: string | null;
    createdAt: Date;
    status: string;
    acceptedAt: Date | null;
    proposedWinnerId: string | null;
    resultEnteredAt: Date | null;
    disputedAt: Date | null;
  },
  timing: LadderTiming,
): boolean {
  if (offer.winnerId) return false;
  if (offer.proposedWinnerId && offer.resultEnteredAt && !offer.disputedAt) return true;
  if (offer.status === "REJECTED") return false;
  if (offer.createdAt.getTime() + MATCH_WINDOW_DAYS * DAY_MS <= Date.now()) return false;
  if (offer.status === "PENDING") {
    return offer.createdAt.getTime() + timing.responseHours * HOUR_MS > Date.now();
  }
  if (offer.status === "ACCEPTED" && offer.acceptedAt) {
    return offer.acceptedAt.getTime() + timing.acceptDays * DAY_MS > Date.now();
  }
  if (offer.status === "SCHEDULED") {
    return offer.createdAt.getTime() + MATCH_WINDOW_DAYS * DAY_MS > Date.now();
  }
  return false;
}

export function scheduleDeadline(acceptedAt: Date | null): Date | null {
  if (!acceptedAt) return null;
  return new Date(acceptedAt.getTime() + SCHEDULE_HOURS * HOUR_MS);
}

export async function syncLadderOffers(
  clubId: string,
  acceptDaysByLadder: Map<string, number>,
  responseHoursByLadder: Map<string, number>,
  fallback: LadderTiming,
): Promise<void> {
  const offers = await prisma.matchOffer.findMany({
    where: {
      clubId,
      winnerId: null,
      status: { in: ["PENDING", "ACCEPTED", "SCHEDULED"] },
    },
  });
  const now = Date.now();
  for (const offer of offers) {
    const timing = offerTimingFor(offer, acceptDaysByLadder, responseHoursByLadder, fallback);
    if (offer.status === "PENDING" && offer.createdAt.getTime() + timing.responseHours * HOUR_MS <= now) {
      await prisma.matchOffer.update({
        where: { id: offer.id },
        data: { status: "REJECTED", respondedAt: new Date() },
      });
      continue;
    }
    if (
      offer.proposedWinnerId
      && offer.resultEnteredAt
      && !offer.disputedAt
      && offer.resultEnteredAt.getTime() + RESULT_CONFIRM_HOURS * HOUR_MS <= now
    ) {
      await finalizeConfirmedOffer(offer.id);
    }
  }
}

export async function finalizeConfirmedOffer(offerId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const offer = await tx.matchOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.winnerId || !offer.proposedWinnerId) return;
    const ladderId = offer.ladderId;
    if (!ladderId) return;
    await applyOfferWinnerTx(tx, {
      ladderId,
      offer: { fromUserId: offer.fromUserId, toUserId: offer.toUserId },
      winnerId: offer.proposedWinnerId,
      forfeit: offer.forfeit,
    });
    await tx.matchOffer.update({
      where: { id: offerId },
      data: { winnerId: offer.proposedWinnerId },
    });
  });
}

export async function assertNoRecentRematch(
  tx: Prisma.TransactionClient,
  input: { ladderId: string; firstId: string; secondId: string },
): Promise<void> {
  const since = new Date(Date.now() - COOLDOWN_DAYS * DAY_MS);
  const recent = await tx.matchOffer.findFirst({
    where: {
      ladderId: input.ladderId,
      winnerId: { not: null },
      updatedAt: { gt: since },
      OR: [
        { fromUserId: input.firstId, toUserId: input.secondId },
        { fromUserId: input.secondId, toUserId: input.firstId },
      ],
    },
  });
  if (recent) {
    throw new AppError(400, "VALIDATION_ERROR", "Aynı rakibe 7 gün dolmadan yeni defi gönderilemez");
  }
}

export async function assertSingleActiveOffer(
  tx: Prisma.TransactionClient,
  input: { ladderId: string; userId: string; timing: LadderTiming },
): Promise<void> {
  const active = await tx.matchOffer.findMany({
    where: {
      ladderId: input.ladderId,
      winnerId: null,
      status: { in: ["PENDING", "ACCEPTED", "SCHEDULED"] },
      OR: [{ fromUserId: input.userId }, { toUserId: input.userId }],
    },
  });
  if (active.some((row) => offerStillActive(row, input.timing))) {
    throw new AppError(400, "VALIDATION_ERROR", "Aynı anda yalnızca bir aktif defi olabilir");
  }
}

export { COOLDOWN_DAYS, DAY_MS, HOUR_MS, MATCH_WINDOW_DAYS, RESULT_CONFIRM_HOURS, SCHEDULE_HOURS };

export function canPostpone(scheduledAt: Date, postponeCount: number): boolean {
  if (postponeCount >= 1) return false;
  return scheduledAt.getTime() - Date.now() >= POSTPONE_MIN_HOURS * HOUR_MS;
}
