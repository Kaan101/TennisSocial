import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { ladderCreateSchema, ladderEnsureSchema, ladderListSchema, ladderPlayerSchema, ladderSettingsUpdateSchema, matchOfferCreateSchema, matchOfferListSchema, matchOfferResultSchema } from "@club/shared";
import { assertRole, requireUser } from "../lib/authz";
import { assertLadderChallenge } from "../services/ladders";
import { AppError, notFound, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";

// hashtext returns integer. pg_advisory_xact_lock(integer) does not exist, so the
// old call threw and the API answered 500 before the player row was written.
async function lockKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0::bigint))`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function displayName(profile: { firstName: string; lastName: string } | null | undefined): string {
  return `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
}

function pendingSince(maxAcceptDays: number): Date {
  return new Date(Date.now() - maxAcceptDays * DAY_MS);
}

function offerStillPending(
  offer: { winnerId: string | null; createdAt: Date; status: string },
  acceptDays: number,
): boolean {
  return offer.status === "PENDING" && !offer.winnerId && offer.createdAt.getTime() + acceptDays * DAY_MS > Date.now();
}

function daysLeft(createdAt: Date, acceptDays: number): number {
  const left = createdAt.getTime() + acceptDays * DAY_MS - Date.now();
  return Math.max(1, Math.ceil(left / DAY_MS));
}

function ladderSettings(row: {
  maxRankSpan: number;
  showOfferingPlayer: boolean;
  showChallengeResult: boolean;
  acceptDays: number;
  responseHours: number;
}) {
  return {
    maxRankSpan: row.maxRankSpan,
    showOfferingPlayer: row.showOfferingPlayer,
    showChallengeResult: row.showChallengeResult,
    acceptDays: row.acceptDays,
    responseHours: row.responseHours,
  };
}

function presentPlayer(player: {
  userId: string;
  rank: number;
  points: number;
  lastMove: "UP" | "DOWN" | null;
  user: { profile: { firstName: string; lastName: string; photoUrl: string | null } | null };
}) {
  return {
    userId: player.userId,
    rank: player.rank,
    points: player.points,
    name: displayName(player.user.profile),
    firstName: player.user.profile?.firstName ?? "",
    lastName: player.user.profile?.lastName ?? "",
    photoUrl: player.user.profile?.photoUrl ?? null,
    lastMove: player.lastMove,
  };
}

function presentOffer(
  row: {
    id: string;
    fromUserId: string;
    toUserId: string;
    clubId: string;
    ladderId: string | null;
    createdAt: Date;
    status: "PENDING";
    fromUser: { profile: { firstName: string; lastName: string } | null };
    toUser: { profile: { firstName: string; lastName: string } | null };
  },
  acceptDays: number,
) {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    fromName: displayName(row.fromUser.profile),
    toName: displayName(row.toUser.profile),
    clubId: row.clubId,
    ladderId: row.ladderId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    daysLeft: daysLeft(row.createdAt, acceptDays),
  };
}

export async function ladderRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/ladders", async (req) => {
    requireUser(req);
    const query = parse(ladderListSchema, req.query);
    const rows = await prisma.ladder.findMany({
      where: { deletedAt: null, ...(query.clubId ? { clubId: query.clubId } : {}) },
      include: {
        club: true,
        players: { include: { user: { include: { profile: true } } }, orderBy: { rank: "asc" } },
      },
      orderBy: { name: "asc" },
    });
    const maxAcceptDays = rows.reduce((max, row) => Math.max(max, row.acceptDays), 7);
    const offers = query.clubId
      ? await prisma.matchOffer.findMany({
          where: { clubId: query.clubId, status: "PENDING", winnerId: null, createdAt: { gt: pendingSince(maxAcceptDays) } },
          include: { fromUser: { include: { profile: true } }, toUser: { include: { profile: true } } },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const acceptDaysByLadder = new Map(rows.map((row) => [row.id, row.acceptDays]));
    const defaultAcceptDays = rows[0]?.acceptDays ?? 7;
    return {
      data: rows.map((row) => {
        const playerIds = new Set(row.players.map((player) => player.userId));
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          clubId: row.clubId,
          clubName: row.club?.name ?? null,
          ...ladderSettings(row),
          playerCount: row.players.length,
          players: row.players.map(presentPlayer),
          offers: offers
            .filter((offer) => (offer.ladderId ? offer.ladderId === row.id : playerIds.has(offer.fromUserId) || playerIds.has(offer.toUserId)))
            .filter((offer) => playerIds.has(offer.fromUserId) || playerIds.has(offer.toUserId))
            .filter((offer) => offerStillPending(offer, offer.ladderId ? (acceptDaysByLadder.get(offer.ladderId) ?? defaultAcceptDays) : row.acceptDays))
            .map((offer) => presentOffer(offer, offer.ladderId ? (acceptDaysByLadder.get(offer.ladderId) ?? defaultAcceptDays) : row.acceptDays)),
        };
      }),
    };
  });

  app.post("/api/ladders", async (req, reply) => {
    requireUser(req);
    const body = parse(ladderCreateSchema, req.body);
    const club = await prisma.club.findUnique({ where: { id: body.clubId } });
    if (!club) throw notFound("Kulüp bulunamadı");
    const ladder = await prisma.ladder.create({ data: { name: body.name, clubId: club.id } });
    return reply.status(201).send({
      id: ladder.id,
      name: ladder.name,
      clubId: ladder.clubId,
      description: ladder.description,
      ...ladderSettings(ladder),
      playerCount: 0,
      players: [],
    });
  });

  app.patch("/api/ladders/:id", async (req) => {
    const viewer = requireUser(req);
    assertRole(viewer, ["CLUB_MANAGER"]);
    const { id } = req.params as { id: string };
    const body = parse(ladderSettingsUpdateSchema, req.body);
    const ladder = await prisma.ladder.findFirst({ where: { id, deletedAt: null } });
    if (!ladder) throw notFound("Merdiven bulunamadı");
    const updated = await prisma.ladder.update({
      where: { id },
      data: {
        ...(body.showOfferingPlayer !== undefined ? { showOfferingPlayer: body.showOfferingPlayer } : {}),
        ...(body.showChallengeResult !== undefined ? { showChallengeResult: body.showChallengeResult } : {}),
        ...(body.acceptDays !== undefined ? { acceptDays: body.acceptDays } : {}),
        ...(body.responseHours !== undefined ? { responseHours: body.responseHours } : {}),
        ...(body.maxRankSpan !== undefined ? { maxRankSpan: body.maxRankSpan } : {}),
      },
    });
    return { id: updated.id, ...ladderSettings(updated) };
  });

  app.post("/api/ladders/ensure", async (req, reply) => {
    requireUser(req);
    const body = parse(ladderEnsureSchema, req.body);
    const club = await prisma.club.findUnique({ where: { id: body.clubId } });
    if (!club) throw notFound("Kulüp bulunamadı");
    const result = await prisma.$transaction(async (tx) => {
      await lockKey(tx, body.clubId);
      const existing = await tx.ladder.findFirst({
        where: { clubId: body.clubId, deletedAt: null },
        orderBy: { createdAt: "asc" },
      });
      if (existing) return { ladder: existing, created: false };
      const ladder = await tx.ladder.create({ data: { name: "Merdiven", clubId: body.clubId } });
      return { ladder, created: true };
    });
    const payload = { id: result.ladder.id, name: result.ladder.name, clubId: result.ladder.clubId, created: result.created };
    return result.created ? reply.status(201).send(payload) : payload;
  });

  app.post("/api/ladders/:id/players", async (req, reply) => {
    requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(ladderPlayerSchema, req.body);
    const ladder = await prisma.ladder.findFirst({ where: { id, deletedAt: null } });
    if (!ladder) throw notFound("Merdiven bulunamadı");
    const user = await prisma.user.findFirst({
      where: { id: body.userId, deletedAt: null, profile: { is: { deletedAt: null } } },
      include: { profile: true },
    });
    if (!user?.profile) throw notFound("Oyuncu bulunamadı");
    const result = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `ladder:${id}`);
      const existing = await tx.ladderPlayer.findUnique({
        where: { ladderId_userId: { ladderId: id, userId: user.id } },
      });
      if (existing) return { row: existing, added: false as const };
      const last = await tx.ladderPlayer.aggregate({ where: { ladderId: id }, _max: { rank: true } });
      const row = await tx.ladderPlayer.create({
        data: { ladderId: id, userId: user.id, rank: (last._max.rank ?? 0) + 1 },
      });
      return { row, added: true as const };
    });
    const payload = {
      userId: result.row.userId,
      rank: result.row.rank,
      points: result.row.points,
      name: displayName(user.profile),
      added: result.added,
    };
    return result.added ? reply.status(201).send(payload) : payload;
  });

  app.get("/api/ladders/:id", async (req) => {
    requireUser(req);
    const { id } = req.params as { id: string };
    const ladder = await prisma.ladder.findFirst({
      where: { id, deletedAt: null },
      include: {
        players: { include: { user: { include: { profile: true } } }, orderBy: { rank: "asc" } },
        history: { orderBy: { createdAt: "desc" }, take: 20, include: { user: { include: { profile: true } } } },
      },
    });
    if (!ladder) throw notFound("Merdiven bulunamadı");
    return {
      id: ladder.id,
      name: ladder.name,
      description: ladder.description,
      clubId: ladder.clubId,
      ...ladderSettings(ladder),
      players: ladder.players.map(presentPlayer),
      history: ladder.history.map((row) => ({
        id: row.id,
        userId: row.userId,
        name: displayName(row.user.profile),
        previousRank: row.previousRank,
        newRank: row.newRank,
        previousPoints: row.previousPoints,
        newPoints: row.newPoints,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });

  app.get("/api/match-offers", async (req) => {
    const viewer = requireUser(req);
    const query = parse(matchOfferListSchema, req.query);
    const clubLadders = await prisma.ladder.findMany({
      where: { clubId: query.clubId, deletedAt: null },
      select: { id: true, acceptDays: true },
    });
    const acceptDaysByLadder = new Map(clubLadders.map((row) => [row.id, row.acceptDays]));
    const maxAcceptDays = clubLadders.reduce((max, row) => Math.max(max, row.acceptDays), 7);
    const rows = await prisma.matchOffer.findMany({
      where: {
        clubId: query.clubId,
        status: "PENDING",
        winnerId: null,
        createdAt: { gt: pendingSince(maxAcceptDays) },
        OR: [{ fromUserId: viewer.id }, { toUserId: viewer.id }],
      },
      include: {
        fromUser: { include: { profile: true } },
        toUser: { include: { profile: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      data: rows
        .filter((offer) => offerStillPending(offer, offer.ladderId ? (acceptDaysByLadder.get(offer.ladderId) ?? 7) : maxAcceptDays))
        .map((offer) => presentOffer(offer, offer.ladderId ? (acceptDaysByLadder.get(offer.ladderId) ?? 7) : maxAcceptDays)),
    };
  });

  app.post("/api/match-offers", async (req, reply) => {
    const viewer = requireUser(req);
    const body = parse(matchOfferCreateSchema, req.body);
    if (body.toUserId === viewer.id) {
      throw new AppError(400, "VALIDATION_ERROR", "Kendine maç teklif edemezsin");
    }
    const club = await prisma.club.findUnique({ where: { id: body.clubId } });
    if (!club) throw notFound("Kulüp bulunamadı");
    const recipient = await prisma.user.findFirst({
      where: { id: body.toUserId, deletedAt: null },
      include: { profile: true },
    });
    if (!recipient?.profile || recipient.profile.deletedAt) throw notFound("Oyuncu bulunamadı");
    let ladderId: string | null = null;
    let offerAcceptDays = 7;
    if (body.ladderId) {
      const ladder = await prisma.ladder.findFirst({ where: { id: body.ladderId, clubId: club.id, deletedAt: null } });
      if (!ladder) throw notFound("Merdiven bulunamadı");
      ladderId = ladder.id;
      offerAcceptDays = ladder.acceptDays;
      await assertLadderChallenge({ ladderId: ladder.id, challengerId: viewer.id, recipientId: body.toUserId });
    }
    const onLadder = await prisma.ladderPlayer.findFirst({
      where: { userId: recipient.id, ladder: { id: ladderId ?? undefined, clubId: club.id, deletedAt: null } },
    });
    if (!onLadder) throw new AppError(400, "VALIDATION_ERROR", "Bu oyuncu kulübün merdiveninde değil");
    const result = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `offer:${viewer.id}:${body.toUserId}:${body.clubId}`);
      const existing = await tx.matchOffer.findFirst({
        where: {
          fromUserId: viewer.id,
          toUserId: body.toUserId,
          clubId: body.clubId,
          status: "PENDING",
          winnerId: null,
          createdAt: { gt: pendingSince(offerAcceptDays) },
        },
      });
      if (existing && offerStillPending(existing, offerAcceptDays)) return { offer: existing, created: false };
      const offer = await tx.matchOffer.create({
        data: { fromUserId: viewer.id, toUserId: body.toUserId, clubId: body.clubId, ladderId, status: "PENDING" },
      });
      return { offer, created: true };
    });
    const payload = {
      id: result.offer.id,
      fromUserId: result.offer.fromUserId,
      toUserId: result.offer.toUserId,
      clubId: result.offer.clubId,
      status: result.offer.status,
      created: result.created,
    };
    return result.created ? reply.status(201).send(payload) : payload;
  });

  app.post("/api/match-offers/:id/result", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(matchOfferResultSchema, req.body);
    const offer = await prisma.matchOffer.findUnique({ where: { id } });
    if (!offer) throw notFound("Teklif bulunamadı");
    const offerLadder = offer.ladderId
      ? await prisma.ladder.findFirst({ where: { id: offer.ladderId, deletedAt: null }, select: { acceptDays: true } })
      : null;
    const offerAcceptDays = offerLadder?.acceptDays ?? 7;
    if (!offerStillPending(offer, offerAcceptDays)) throw new AppError(400, "VALIDATION_ERROR", "Bu teklif artık beklemede değil");
    if (viewer.id !== offer.fromUserId && viewer.id !== offer.toUserId) {
      throw new AppError(403, "FORBIDDEN", "Bu teklifin sonucunu yazamazsın");
    }
    if (body.winnerId !== offer.fromUserId && body.winnerId !== offer.toUserId) {
      throw new AppError(400, "VALIDATION_ERROR", "Kazanan bu teklifin oyuncusu olmalı");
    }
    const loserId = body.winnerId === offer.fromUserId ? offer.toUserId : offer.fromUserId;
    const ladderId = offer.ladderId ?? (await sharedLadderId(offer.clubId, offer.fromUserId, offer.toUserId));
    if (!ladderId) throw new AppError(400, "VALIDATION_ERROR", "İki oyuncu aynı merdivende değil");
    await prisma.$transaction(async (tx) => {
      await lockKey(tx, `ladder:${ladderId}`);
      const fresh = await tx.matchOffer.findUnique({ where: { id } });
      if (!fresh || !offerStillPending(fresh, offerAcceptDays)) throw new AppError(400, "VALIDATION_ERROR", "Bu teklif artık beklemede değil");
      const winner = await tx.ladderPlayer.findUnique({
        where: { ladderId_userId: { ladderId, userId: body.winnerId } },
      });
      const loser = await tx.ladderPlayer.findUnique({
        where: { ladderId_userId: { ladderId, userId: loserId } },
      });
      if (!winner || !loser) throw new AppError(400, "VALIDATION_ERROR", "İki oyuncu aynı merdivende değil");
      const better = Math.min(winner.rank, loser.rank);
      const worse = Math.max(winner.rank, loser.rank);
      if (winner.rank !== better) {
        await tx.ladderPlayer.update({ where: { id: winner.id }, data: { rank: 1_000_000 } });
        await tx.ladderPlayer.update({ where: { id: loser.id }, data: { rank: worse, lastMove: "DOWN" } });
        await tx.ladderPlayer.update({ where: { id: winner.id }, data: { rank: better, lastMove: "UP" } });
      }
      await tx.matchOffer.update({ where: { id }, data: { winnerId: body.winnerId } });
    });
    return { id, winnerId: body.winnerId };
  });
}

async function sharedLadderId(clubId: string, firstId: string, secondId: string): Promise<string | null> {
  const seats = await prisma.ladderPlayer.findMany({
    where: { userId: { in: [firstId, secondId] }, ladder: { clubId, deletedAt: null } },
    select: { ladderId: true, userId: true },
  });
  const byLadder = new Map<string, Set<string>>();
  for (const seat of seats) {
    const users = byLadder.get(seat.ladderId) ?? new Set<string>();
    users.add(seat.userId);
    byLadder.set(seat.ladderId, users);
  }
  for (const [ladderId, users] of byLadder) {
    if (users.has(firstId) && users.has(secondId)) return ladderId;
  }
  return null;
}
