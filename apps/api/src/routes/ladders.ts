import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  ladderCreateSchema,
  ladderEnsureSchema,
  ladderListSchema,
  ladderPlayerPassiveSchema,
  ladderPlayerSchema,
  ladderSettingsUpdateSchema,
  matchOfferCreateSchema,
  matchOfferListSchema,
  matchOfferResultSchema,
  matchOfferScheduleSchema,
  effectiveLadderMaxRankSpan,
} from "@club/shared";
import { assertRole, requireUser } from "../lib/authz";
import { applyOfferWinnerTx, assertLadderChallenge, isLadderPlayerPassive } from "../services/ladders";
import {
  applyFinalizedOfferResultTx,
  assertSingleActiveOffer,
  canPostpone,
  finalizeConfirmedOffer,
  MATCH_WINDOW_DAYS,
  offerStillActive,
  offerTimingFor,
  scheduleDeadline,
  syncLadderOffers,
  DAY_MS,
  HOUR_MS,
  RESULT_CONFIRM_HOURS,
  SCHEDULE_HOURS,
} from "../services/matchOfferFlow";
import { AppError, notFound, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";

// hashtext returns integer. pg_advisory_xact_lock(integer) does not exist, so the
// old call threw and the API answered 500 before the player row was written.
async function lockKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0::bigint))`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function displayName(profile: { firstName: string; lastName: string } | null | undefined): string {
  return `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
}

type LadderTiming = { acceptDays: number; responseHours: number };

function acceptCountdown(acceptedAt: Date, acceptDays: number): { days: number; hours: number } {
  const left = acceptedAt.getTime() + acceptDays * DAY_MS - Date.now();
  const totalHours = Math.max(0, Math.floor(left / HOUR_MS));
  return { days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}

function ladderSettings(row: {
  maxRankSpan: number;
  showOfferingPlayer: boolean;
  showChallengeResult: boolean;
  acceptDays: number;
  responseHours: number;
}) {
  return {
    maxRankSpan: effectiveLadderMaxRankSpan(row.maxRankSpan),
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
  passiveUntil: Date | null;
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
    passiveUntil: player.passiveUntil?.toISOString() ?? null,
    passive: isLadderPlayerPassive(player),
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
    acceptedAt: Date | null;
    scheduledAt: Date | null;
    proposedWinnerId: string | null;
    resultEnteredAt: Date | null;
    disputedAt: Date | null;
    postponeCount: number;
    forfeit: boolean;
    status: string;
    fromUser: { profile: { firstName: string; lastName: string } | null };
    toUser: { profile: { firstName: string; lastName: string } | null };
  },
  timing: LadderTiming,
) {
  const acceptedAt = row.acceptedAt?.toISOString() ?? null;
  const deadline = scheduleDeadline(row.acceptedAt);
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
    acceptedAt,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    proposedWinnerId: row.proposedWinnerId,
    resultEnteredAt: row.resultEnteredAt?.toISOString() ?? null,
    disputedAt: row.disputedAt?.toISOString() ?? null,
    postponeCount: row.postponeCount,
    forfeit: row.forfeit,
    scheduleDeadlineAt: deadline?.toISOString() ?? null,
    acceptDays: timing.acceptDays,
    ...(row.status === "ACCEPTED" && row.acceptedAt
      ? { acceptRemaining: acceptCountdown(row.acceptedAt, timing.acceptDays) }
      : {}),
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
    const acceptDaysByLadder = new Map(rows.map((row) => [row.id, row.acceptDays]));
    const responseHoursByLadder = new Map(rows.map((row) => [row.id, row.responseHours]));
    const defaultTiming: LadderTiming = {
      acceptDays: rows[0]?.acceptDays ?? 7,
      responseHours: rows[0]?.responseHours ?? 48,
    };
    if (query.clubId) {
      await syncLadderOffers(query.clubId, acceptDaysByLadder, responseHoursByLadder, defaultTiming);
    }
    const offers = query.clubId
      ? await prisma.matchOffer.findMany({
          where: { clubId: query.clubId, winnerId: null, status: { in: ["PENDING", "ACCEPTED", "SCHEDULED"] } },
          include: { fromUser: { include: { profile: true } }, toUser: { include: { profile: true } } },
          orderBy: { createdAt: "desc" },
        })
      : [];
    return {
      data: rows.map((row) => {
        const playerIds = new Set(row.players.map((player) => player.userId));
        const rowTiming: LadderTiming = { acceptDays: row.acceptDays, responseHours: row.responseHours };
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
            .filter((offer) => offerStillActive(offer, offerTimingFor(offer, acceptDaysByLadder, responseHoursByLadder, rowTiming)))
            .map((offer) => presentOffer(offer, offerTimingFor(offer, acceptDaysByLadder, responseHoursByLadder, rowTiming))),
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
      select: { id: true, acceptDays: true, responseHours: true },
    });
    const acceptDaysByLadder = new Map(clubLadders.map((row) => [row.id, row.acceptDays]));
    const responseHoursByLadder = new Map(clubLadders.map((row) => [row.id, row.responseHours]));
    const defaultTiming: LadderTiming = {
      acceptDays: clubLadders.reduce((max, row) => Math.max(max, row.acceptDays), 7),
      responseHours: clubLadders.reduce((max, row) => Math.max(max, row.responseHours), 48),
    };
    const rows = await prisma.matchOffer.findMany({
      where: {
        clubId: query.clubId,
        status: { in: ["PENDING", "ACCEPTED", "SCHEDULED"] },
        winnerId: null,
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
        .filter((offer) => offerStillActive(offer, offerTimingFor(offer, acceptDaysByLadder, responseHoursByLadder, defaultTiming)))
        .map((offer) => presentOffer(offer, offerTimingFor(offer, acceptDaysByLadder, responseHoursByLadder, defaultTiming))),
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
    let offerTiming: LadderTiming = { acceptDays: 7, responseHours: 48 };
    if (body.ladderId) {
      const ladder = await prisma.ladder.findFirst({ where: { id: body.ladderId, clubId: club.id, deletedAt: null } });
      if (!ladder) throw notFound("Merdiven bulunamadı");
      ladderId = ladder.id;
      offerTiming = { acceptDays: ladder.acceptDays, responseHours: ladder.responseHours };
      await assertLadderChallenge({ ladderId: ladder.id, challengerId: viewer.id, recipientId: body.toUserId });
    }
    const onLadder = await prisma.ladderPlayer.findFirst({
      where: { userId: recipient.id, ladder: { id: ladderId ?? undefined, clubId: club.id, deletedAt: null } },
    });
    if (!onLadder) throw new AppError(400, "VALIDATION_ERROR", "Bu oyuncu kulübün merdiveninde değil");
    const challengerSeat = ladderId
      ? await prisma.ladderPlayer.findUnique({ where: { ladderId_userId: { ladderId, userId: viewer.id } } })
      : null;
    if (isLadderPlayerPassive(challengerSeat) || isLadderPlayerPassive(onLadder)) {
      throw new AppError(400, "VALIDATION_ERROR", "Pasif oyuncu defi gönderemez veya alamaz");
    }
    const clubLadders = await prisma.ladder.findMany({
      where: { clubId: body.clubId, deletedAt: null },
      select: { id: true, acceptDays: true, responseHours: true },
    });
    const acceptDaysByLadder = new Map(clubLadders.map((row) => [row.id, row.acceptDays]));
    const responseHoursByLadder = new Map(clubLadders.map((row) => [row.id, row.responseHours]));
    await syncLadderOffers(body.clubId, acceptDaysByLadder, responseHoursByLadder, offerTiming);
    const result = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `offer:${viewer.id}:${body.toUserId}:${body.clubId}`);
      if (ladderId) {
        await assertSingleActiveOffer(tx, { ladderId, userId: viewer.id, timing: offerTiming });
        await assertSingleActiveOffer(tx, { ladderId, userId: body.toUserId, timing: offerTiming });
      }
      const existing = await tx.matchOffer.findFirst({
        where: {
          clubId: body.clubId,
          winnerId: null,
          status: { in: ["PENDING", "ACCEPTED", "SCHEDULED"] },
          ...(ladderId ? { ladderId } : {}),
          OR: [
            { fromUserId: viewer.id, toUserId: body.toUserId },
            { fromUserId: body.toUserId, toUserId: viewer.id },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing && offerStillActive(existing, offerTiming)) return { offer: existing, created: false };
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

  app.post("/api/match-offers/:id/accept", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const offer = await prisma.matchOffer.findUnique({
      where: { id },
      include: { fromUser: { include: { profile: true } }, toUser: { include: { profile: true } } },
    });
    if (!offer) throw notFound("Teklif bulunamadı");
    if (viewer.id !== offer.toUserId) {
      throw new AppError(403, "FORBIDDEN", "Yalnızca teklif alan oyuncu kabul edebilir");
    }
    const offerLadder = offer.ladderId
      ? await prisma.ladder.findFirst({
          where: { id: offer.ladderId, deletedAt: null },
          select: { acceptDays: true, responseHours: true },
        })
      : null;
    const timing: LadderTiming = offerLadder ?? { acceptDays: 7, responseHours: 48 };
    if (offer.status !== "PENDING" || !offerStillActive(offer, timing)) {
      throw new AppError(400, "VALIDATION_ERROR", "Bu teklif artık beklemede değil");
    }
    const acceptedAt = new Date();
    const updated = await prisma.matchOffer.update({
      where: { id },
      data: { status: "ACCEPTED", acceptedAt, respondedAt: acceptedAt },
      include: { fromUser: { include: { profile: true } }, toUser: { include: { profile: true } } },
    });
    return presentOffer(updated, timing);
  });

  app.post("/api/match-offers/:id/schedule", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(matchOfferScheduleSchema, req.body);
    const offer = await prisma.matchOffer.findUnique({ where: { id } });
    if (!offer) throw notFound("Teklif bulunamadı");
    if (viewer.id !== offer.fromUserId && viewer.id !== offer.toUserId) {
      throw new AppError(403, "FORBIDDEN", "Bu teklife tarih yazamazsın");
    }
    if (!offer.acceptedAt) throw new AppError(400, "VALIDATION_ERROR", "Önce teklif kabul edilmeli");
    const rescheduling = Boolean(offer.scheduledAt);
    if (!rescheduling) {
      const deadline = scheduleDeadline(offer.acceptedAt);
      if (!deadline || deadline.getTime() < Date.now()) {
        throw new AppError(400, "VALIDATION_ERROR", "Maç tarihi için 72 saatlik süre doldu");
      }
    }
    if (offer.createdAt.getTime() + MATCH_WINDOW_DAYS * DAY_MS < Date.parse(body.scheduledAt)) {
      throw new AppError(400, "VALIDATION_ERROR", "Maç, defi oluşturulduktan en geç 10 gün içinde oynanmalı");
    }
    const scheduledAt = new Date(body.scheduledAt);
    const updated = await prisma.matchOffer.update({
      where: { id },
      data: { scheduledAt, status: "SCHEDULED" },
    });
    return { id: updated.id, scheduledAt: updated.scheduledAt?.toISOString() ?? null, status: updated.status };
  });

  app.post("/api/match-offers/:id/postpone", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(matchOfferScheduleSchema, req.body);
    const offer = await prisma.matchOffer.findUnique({ where: { id } });
    if (!offer) throw notFound("Teklif bulunamadı");
    if (viewer.id !== offer.fromUserId && viewer.id !== offer.toUserId) {
      throw new AppError(403, "FORBIDDEN", "Bu teklifi erteleyemezsin");
    }
    if (!offer.scheduledAt) throw new AppError(400, "VALIDATION_ERROR", "Planlı maç yok");
    if (!canPostpone(offer.scheduledAt, offer.postponeCount)) {
      throw new AppError(400, "VALIDATION_ERROR", "Erteleme kurallarına uygun değil");
    }
    const scheduledAt = new Date(body.scheduledAt);
    if (offer.createdAt.getTime() + MATCH_WINDOW_DAYS * DAY_MS < scheduledAt.getTime()) {
      throw new AppError(400, "VALIDATION_ERROR", "Ertelenen maç 10 gün sınırını aşamaz");
    }
    const updated = await prisma.matchOffer.update({
      where: { id },
      data: { scheduledAt, postponeCount: offer.postponeCount + 1 },
    });
    return { id: updated.id, scheduledAt: updated.scheduledAt?.toISOString() ?? null, postponeCount: updated.postponeCount };
  });

  app.post("/api/match-offers/:id/result", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(matchOfferResultSchema, req.body);
    const offer = await prisma.matchOffer.findUnique({ where: { id } });
    if (!offer) throw notFound("Teklif bulunamadı");
    if (viewer.id !== offer.toUserId) {
      throw new AppError(403, "FORBIDDEN", "Sonucu yalnızca teklif alan oyuncu girebilir");
    }
    if (!offer.scheduledAt) throw new AppError(400, "VALIDATION_ERROR", "Önce maç tarihi belirlenmeli");
    const afterMatch = offer.scheduledAt.getTime();
    const now = Date.now();
    if (now < afterMatch) throw new AppError(400, "VALIDATION_ERROR", "Maç saatinden önce sonuç girilemez");
    if (now > afterMatch + RESULT_CONFIRM_HOURS * HOUR_MS) {
      throw new AppError(400, "VALIDATION_ERROR", "Sonuç giriş süresi doldu");
    }
    if (body.winnerId !== offer.fromUserId && body.winnerId !== offer.toUserId) {
      throw new AppError(400, "VALIDATION_ERROR", "Kazanan bu teklifin oyuncusu olmalı");
    }
    if (offer.proposedWinnerId || offer.winnerId) throw new AppError(409, "CONFLICT", "Sonuç zaten girildi");
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.matchOffer.update({
        where: { id },
        data: { proposedWinnerId: body.winnerId, resultEnteredAt: new Date(), disputedAt: null, forfeit: false },
      });
      await applyFinalizedOfferResultTx(tx, row);
      return tx.matchOffer.findUniqueOrThrow({ where: { id } });
    });
    return { id: updated.id, proposedWinnerId: updated.proposedWinnerId, winnerId: updated.winnerId };
  });

  app.post("/api/match-offers/:id/confirm", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const offer = await prisma.matchOffer.findUnique({ where: { id } });
    if (!offer) throw notFound("Teklif bulunamadı");
    if (viewer.id !== offer.fromUserId) {
      throw new AppError(403, "FORBIDDEN", "Yalnızca rakip sonucu onaylayabilir");
    }
    if (!offer.proposedWinnerId || !offer.resultEnteredAt || offer.disputedAt) {
      throw new AppError(400, "VALIDATION_ERROR", "Onaylanacak sonuç yok");
    }
    await finalizeConfirmedOffer(id);
    return { id, winnerId: offer.proposedWinnerId };
  });

  app.post("/api/match-offers/:id/dispute", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const offer = await prisma.matchOffer.findUnique({ where: { id } });
    if (!offer) throw notFound("Teklif bulunamadı");
    if (viewer.id !== offer.fromUserId) {
      throw new AppError(403, "FORBIDDEN", "Yalnızca rakip itiraz edebilir");
    }
    if (!offer.proposedWinnerId || !offer.resultEnteredAt) {
      throw new AppError(400, "VALIDATION_ERROR", "İtiraz edilecek sonuç yok");
    }
    await prisma.matchOffer.update({
      where: { id },
      data: { disputedAt: new Date(), proposedWinnerId: null, resultEnteredAt: null },
    });
    return { id, disputed: true };
  });

  app.post("/api/match-offers/:id/cancel", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const offer = await prisma.matchOffer.findUnique({ where: { id } });
    if (!offer) throw notFound("Teklif bulunamadı");
    if (viewer.id !== offer.fromUserId && viewer.id !== offer.toUserId) {
      throw new AppError(403, "FORBIDDEN", "Bu defiyi iptal edemezsin");
    }
    if (offer.winnerId || offer.proposedWinnerId) {
      throw new AppError(400, "VALIDATION_ERROR", "Sonuç girilmiş defi iptal edilemez");
    }
    if (!["PENDING", "ACCEPTED", "SCHEDULED"].includes(offer.status)) {
      throw new AppError(400, "VALIDATION_ERROR", "Bu defi artık açık değil");
    }
    await prisma.matchOffer.delete({ where: { id } });
    return { id, cancelled: true };
  });

  app.post("/api/match-offers/:id/forfeit", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const offer = await prisma.matchOffer.findUnique({ where: { id } });
    if (!offer) throw notFound("Teklif bulunamadı");
    if (viewer.id !== offer.toUserId) {
      throw new AppError(403, "FORBIDDEN", "Hükmen sonucu yalnızca teklif alan girebilir");
    }
    if (!offer.scheduledAt || offer.scheduledAt.getTime() > Date.now()) {
      throw new AppError(400, "VALIDATION_ERROR", "Maç saati gelmeden hükmen sonuç yazılamaz");
    }
    await prisma.matchOffer.update({
      where: { id },
      data: {
        proposedWinnerId: offer.toUserId,
        resultEnteredAt: new Date(),
        forfeit: true,
        disputedAt: null,
      },
    });
    await finalizeConfirmedOffer(id);
    return { id, winnerId: offer.toUserId, forfeit: true };
  });

  app.patch("/api/ladders/:ladderId/players/:userId/passive", async (req) => {
    const viewer = requireUser(req);
    const { ladderId, userId } = req.params as { ladderId: string; userId: string };
    if (viewer.id !== userId && viewer.role !== "CLUB_MANAGER" && viewer.role !== "ADMIN") {
      throw new AppError(403, "FORBIDDEN", "Bu pasiflik ayarını değiştiremezsin");
    }
    const body = parse(ladderPlayerPassiveSchema, req.body);
    const seat = await prisma.ladderPlayer.findUnique({ where: { ladderId_userId: { ladderId, userId } } });
    if (!seat) throw notFound("Oyuncu merdivende değil");
    let passiveUntil: Date | null = null;
    if (body.passiveUntil) {
      passiveUntil = new Date(body.passiveUntil);
      const maxUntil = new Date(Date.now() + 30 * DAY_MS);
      if (passiveUntil.getTime() > maxUntil.getTime()) {
        throw new AppError(400, "VALIDATION_ERROR", "Pasiflik en fazla 30 gün olabilir");
      }
    }
    const updated = await prisma.ladderPlayer.update({ where: { id: seat.id }, data: { passiveUntil } });
    return { userId: updated.userId, passiveUntil: updated.passiveUntil?.toISOString() ?? null };
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
