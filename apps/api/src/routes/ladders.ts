import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { ladderCreateSchema, ladderEnsureSchema, ladderListSchema, ladderPlayerSchema, matchOfferCreateSchema, matchOfferListSchema, matchOfferResultSchema, matchOfferScheduleSchema } from "@club/shared";
import { requireUser } from "../lib/authz";
import { AppError, notFound, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";

// hashtext returns integer. pg_advisory_xact_lock(integer) does not exist, so the
// old call threw and the API answered 500 before the player row was written.
async function lockKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0::bigint))`;
}

const ANSWER_MS = 48 * 60 * 60 * 1000;
const SCHEDULE_MS = 72 * 60 * 60 * 1000;
const PLAY_MS = 7 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const PASSIVE_MS = 30 * 24 * 60 * 60 * 1000;

type Phase = "pending" | "accepted" | "scheduled" | "rejected" | "expired" | "resolved";

type OfferClock = {
  fromUserId: string;
  toUserId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "SCHEDULED";
  winnerId: string | null;
  createdAt: Date;
  respondedAt: Date | null;
  acceptedAt: Date | null;
  scheduledAt: Date | null;
};

const offerInclude = {
  fromUser: { include: { profile: true } },
  toUser: { include: { profile: true } },
} as const;

type OfferRow = Prisma.MatchOfferGetPayload<{ include: typeof offerInclude }>;

function displayName(profile: { firstName: string; lastName: string } | null | undefined): string {
  return `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
}

function offerPhase(offer: OfferClock, now = Date.now()): Phase {
  if (offer.winnerId) return "resolved";
  if (offer.status === "REJECTED") return "rejected";
  if (offer.status === "PENDING") {
    return offer.createdAt.getTime() + ANSWER_MS > now ? "pending" : "expired";
  }
  const acceptedAt = offer.acceptedAt ?? offer.respondedAt;
  if (!acceptedAt) return "expired";
  if (offer.status === "SCHEDULED" || offer.scheduledAt) {
    return acceptedAt.getTime() + PLAY_MS > now ? "scheduled" : "expired";
  }
  if (offer.status === "ACCEPTED") {
    return acceptedAt.getTime() + SCHEDULE_MS > now ? "accepted" : "expired";
  }
  return "expired";
}

function isActive(phase: Phase): boolean {
  return phase === "pending" || phase === "accepted" || phase === "scheduled";
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function presentPlayer(player: {
  userId: string;
  rank: number;
  points: number;
  lastMove: "UP" | "DOWN" | null;
  lastMoveSteps: number | null;
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
    lastMoveSteps: player.lastMoveSteps,
  };
}

function presentOffer(row: OfferRow, now = Date.now()) {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    fromName: displayName(row.fromUser.profile),
    toName: displayName(row.toUser.profile),
    clubId: row.clubId,
    ladderId: row.ladderId,
    status: row.status,
    winnerId: row.winnerId,
    phase: offerPhase(row, now),
    createdAt: row.createdAt.toISOString(),
    respondedAt: iso(row.respondedAt),
    acceptedAt: iso(row.acceptedAt),
    scheduledAt: iso(row.scheduledAt),
  };
}

function later(current: Date, next: Date | null | undefined): Date {
  if (!next || next <= current) return current;
  return next;
}

function activityAt(player: { userId: string; createdAt: Date; updatedAt: Date }, offers: OfferRow[]): Date {
  let latest = later(player.createdAt, player.updatedAt);
  for (const offer of offers) {
    if (offer.fromUserId !== player.userId && offer.toUserId !== player.userId) continue;
    latest = later(latest, offer.createdAt);
    latest = later(latest, offer.respondedAt);
    latest = later(latest, offer.acceptedAt);
    latest = later(latest, offer.scheduledAt);
    latest = later(latest, offer.updatedAt);
  }
  return latest;
}

function parseMatchDay(value: string): Date {
  const day = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(day.getTime())) throw new AppError(400, "VALIDATION_ERROR", "Maç tarihi geçersiz");
  return day;
}

function assertPlayableDay(acceptedAt: Date, day: Date): void {
  const start = new Date(acceptedAt);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(acceptedAt.getTime() + PLAY_MS);
  if (day < start || day.getTime() > end.getTime()) {
    throw new AppError(400, "VALIDATION_ERROR", "Maç kabulden itibaren 7 gün içinde oynanır");
  }
}

export async function ladderRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/ladders", async (req) => {
    const viewer = requireUser(req);
    const query = parse(ladderListSchema, req.query);
    const rows = await prisma.ladder.findMany({
      where: { deletedAt: null, ...(query.clubId ? { clubId: query.clubId } : {}) },
      include: {
        club: true,
        players: { include: { user: { include: { profile: true } } }, orderBy: { rank: "asc" } },
      },
      orderBy: { name: "asc" },
    });
    const offers = rows.length
      ? await prisma.matchOffer.findMany({
          where: query.clubId ? { clubId: query.clubId } : { ladderId: { in: rows.map((row) => row.id) } },
          include: offerInclude,
          orderBy: { createdAt: "desc" },
        })
      : [];
    const now = Date.now();
    return {
      data: rows.map((row) => {
        const playerIds = new Set(row.players.map((player) => player.userId));
        const ladderOffers = offers.filter((offer) => {
          if (offer.ladderId) return offer.ladderId === row.id;
          return Boolean(row.clubId) && offer.clubId === row.clubId && playerIds.has(offer.fromUserId) && playerIds.has(offer.toUserId);
        });
        const presented = ladderOffers.map((offer) => presentOffer(offer, now));
        const players = row.players.map((player, index) => {
          const active = activityAt(player, ladderOffers);
          return {
            ...presentPlayer(player),
            passive: now - active.getTime() >= PASSIVE_MS,
            challengeRight: Math.min(3, index),
            canChallenge: canChallenge(viewer.id, player.userId, row.players, ladderOffers, now),
            offer: presented.find((offer) => offer.fromUserId === player.userId) ?? null,
          };
        });
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          clubId: row.clubId,
          clubName: row.club?.name ?? null,
          maxRankSpan: row.maxRankSpan,
          playerCount: players.length,
          summary: {
            playerCount: players.length,
            activeChallenges: presented.filter((offer) => isActive(offer.phase)).length,
            pendingOffers: presented.filter((offer) => offer.phase === "pending").length,
            passivePlayers: players.filter((player) => player.passive).length,
          },
          players,
          offers: presented,
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
      maxRankSpan: ladder.maxRankSpan,
      playerCount: 0,
      players: [],
    });
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
      maxRankSpan: ladder.maxRankSpan,
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
    const now = Date.now();
    const rows = await prisma.matchOffer.findMany({
      where: {
        clubId: query.clubId,
        status: "PENDING",
        winnerId: null,
        createdAt: { gt: new Date(now - ANSWER_MS) },
        OR: [{ fromUserId: viewer.id }, { toUserId: viewer.id }],
      },
      include: offerInclude,
      orderBy: { createdAt: "desc" },
    });
    return { data: rows.map((row) => presentOffer(row, now)) };
  });

  app.post("/api/match-offers", async (req, reply) => {
    const viewer = requireUser(req);
    const body = parse(matchOfferCreateSchema, req.body);
    if (body.toUserId === viewer.id) {
      throw new AppError(400, "VALIDATION_ERROR", "Kendine defi edemezsin");
    }
    const club = await prisma.club.findUnique({ where: { id: body.clubId } });
    if (!club) throw notFound("Kulüp bulunamadı");
    const recipient = await prisma.user.findFirst({
      where: { id: body.toUserId, deletedAt: null },
      include: { profile: true },
    });
    if (!recipient?.profile || recipient.profile.deletedAt) throw notFound("Oyuncu bulunamadı");
    if (body.ladderId) {
      const chosen = await prisma.ladder.findFirst({ where: { id: body.ladderId, clubId: club.id, deletedAt: null } });
      if (!chosen) throw notFound("Merdiven bulunamadı");
    }
    const ladderId = body.ladderId ?? (await sharedLadderId(club.id, viewer.id, recipient.id));
    if (!ladderId) throw new AppError(400, "VALIDATION_ERROR", "Bu oyuncu kulübün merdiveninde değil");
    const result = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `ladder:${ladderId}`);
      const seats = await tx.ladderPlayer.findMany({
        where: { ladderId },
        orderBy: { rank: "asc" },
        select: { userId: true },
      });
      const fromIndex = seats.findIndex((seat) => seat.userId === viewer.id);
      const toIndex = seats.findIndex((seat) => seat.userId === recipient.id);
      if (fromIndex < 0) throw new AppError(400, "VALIDATION_ERROR", "Merdivende değilsin");
      if (toIndex < 0) throw new AppError(400, "VALIDATION_ERROR", "Bu oyuncu kulübün merdiveninde değil");
      const gap = fromIndex - toIndex;
      if (gap < 1) throw new AppError(400, "VALIDATION_ERROR", "Yalnızca yukarıdaki bir oyuncuya defi edilir");
      if (gap > 3) throw new AppError(400, "VALIDATION_ERROR", "En fazla 3 basamak yukarı defi edilir");
      const previous = await tx.matchOffer.findMany({
        where: { fromUserId: viewer.id, ladderId },
        orderBy: { createdAt: "desc" },
      });
      const now = Date.now();
      const active = previous.find((offer) => isActive(offerPhase(offer, now)));
      if (active) {
        if (active.toUserId === recipient.id && offerPhase(active, now) === "pending") {
          return { offer: active, created: false as const };
        }
        throw new AppError(400, "VALIDATION_ERROR", "Aynı anda tek aktif defi olur");
      }
      const cooled = previous.find((offer) => offer.toUserId === recipient.id && offer.createdAt.getTime() + COOLDOWN_MS > now);
      if (cooled) throw new AppError(400, "VALIDATION_ERROR", "Aynı rakibe 7 gün boyunca yeniden defi edilemez");
      const offer = await tx.matchOffer.create({
        data: { fromUserId: viewer.id, toUserId: recipient.id, clubId: club.id, ladderId, status: "PENDING" },
      });
      return { offer, created: true as const };
    });
    const payload = {
      id: result.offer.id,
      fromUserId: result.offer.fromUserId,
      toUserId: result.offer.toUserId,
      clubId: result.offer.clubId,
      ladderId: result.offer.ladderId,
      status: result.offer.status,
      created: result.created,
    };
    return result.created ? reply.status(201).send(payload) : payload;
  });

  app.post("/api/match-offers/:id/accept", async (req) => {
    const viewer = requireUser(req);
    const offer = await loadOffer((req.params as { id: string }).id);
    if (viewer.id !== offer.toUserId) throw new AppError(403, "FORBIDDEN", "Bu teklifi yalnızca rakip cevaplayabilir");
    if (offerPhase(offer) !== "pending") throw new AppError(400, "VALIDATION_ERROR", "Cevap süresi doldu");
    const now = new Date();
    await prisma.matchOffer.update({
      where: { id: offer.id },
      data: { status: "ACCEPTED", respondedAt: now, acceptedAt: now },
    });
    return { id: offer.id, status: "ACCEPTED" as const };
  });

  app.post("/api/match-offers/:id/decline", async (req) => {
    const viewer = requireUser(req);
    const offer = await loadOffer((req.params as { id: string }).id);
    if (viewer.id !== offer.toUserId) throw new AppError(403, "FORBIDDEN", "Bu teklifi yalnızca rakip cevaplayabilir");
    if (offerPhase(offer) !== "pending") throw new AppError(400, "VALIDATION_ERROR", "Cevap süresi doldu");
    await prisma.matchOffer.update({
      where: { id: offer.id },
      data: { status: "REJECTED", respondedAt: new Date() },
    });
    return { id: offer.id, status: "REJECTED" as const };
  });

  app.post("/api/match-offers/:id/schedule", async (req) => {
    const viewer = requireUser(req);
    const body = parse(matchOfferScheduleSchema, req.body);
    const offer = await loadOffer((req.params as { id: string }).id);
    if (viewer.id !== offer.fromUserId && viewer.id !== offer.toUserId) {
      throw new AppError(403, "FORBIDDEN", "Bu defi için tarih belirleyemezsin");
    }
    if (offerPhase(offer) !== "accepted" || !offer.acceptedAt) {
      throw new AppError(400, "VALIDATION_ERROR", "Tarih 72 saat içinde belirlenmeli");
    }
    const day = parseMatchDay(body.date);
    assertPlayableDay(offer.acceptedAt, day);
    await prisma.matchOffer.update({
      where: { id: offer.id },
      data: { status: "SCHEDULED", scheduledAt: day },
    });
    return { id: offer.id, status: "SCHEDULED" as const, scheduledAt: day.toISOString() };
  });

  app.post("/api/match-offers/:id/result", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(matchOfferResultSchema, req.body);
    const offer = await loadOffer(id);
    if (offerPhase(offer) !== "scheduled") throw new AppError(400, "VALIDATION_ERROR", "Sonuç, maç planlandıktan sonra girilir");
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
      if (!fresh || offerPhase(fresh) !== "scheduled") {
        throw new AppError(400, "VALIDATION_ERROR", "Sonuç, maç planlandıktan sonra girilir");
      }
      const winner = await tx.ladderPlayer.findUnique({
        where: { ladderId_userId: { ladderId, userId: body.winnerId } },
      });
      const loser = await tx.ladderPlayer.findUnique({
        where: { ladderId_userId: { ladderId, userId: loserId } },
      });
      if (!winner || !loser) throw new AppError(400, "VALIDATION_ERROR", "İki oyuncu aynı merdivende değil");
      const better = Math.min(winner.rank, loser.rank);
      const worse = Math.max(winner.rank, loser.rank);
      const steps = worse - better;
      if (winner.rank !== better) {
        await tx.ladderPlayer.update({ where: { id: winner.id }, data: { rank: 1_000_000 } });
        await tx.ladderPlayer.update({ where: { id: loser.id }, data: { rank: worse, lastMove: "DOWN", lastMoveSteps: steps } });
        await tx.ladderPlayer.update({ where: { id: winner.id }, data: { rank: better, lastMove: "UP", lastMoveSteps: steps } });
      }
      await tx.matchOffer.update({ where: { id }, data: { winnerId: body.winnerId } });
    });
    return { id, winnerId: body.winnerId };
  });
}

function canChallenge(
  viewerId: string,
  targetId: string,
  seats: { userId: string }[],
  offers: OfferClock[],
  now: number,
): boolean {
  const fromIndex = seats.findIndex((seat) => seat.userId === viewerId);
  const toIndex = seats.findIndex((seat) => seat.userId === targetId);
  if (fromIndex < 0 || toIndex < 0) return false;
  const gap = fromIndex - toIndex;
  if (gap < 1 || gap > 3) return false;
  const mine = offers.filter((offer) => offer.fromUserId === viewerId);
  if (mine.some((offer) => isActive(offerPhase(offer, now)))) return false;
  if (mine.some((offer) => offer.toUserId === targetId && offer.createdAt.getTime() + COOLDOWN_MS > now)) return false;
  return true;
}

async function loadOffer(id: string) {
  const offer = await prisma.matchOffer.findUnique({ where: { id } });
  if (!offer) throw notFound("Teklif bulunamadı");
  return offer;
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
