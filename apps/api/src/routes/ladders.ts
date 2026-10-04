import type { FastifyInstance } from "fastify";
import { ladderCreateSchema, ladderEnsureSchema, ladderListSchema, ladderPlayerSchema, matchOfferCreateSchema, matchOfferListSchema } from "@club/shared";
import { requireUser } from "../lib/authz";
import { AppError, notFound, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";

function displayName(profile: { firstName: string; lastName: string } | null | undefined): string {
  return `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
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
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        clubId: row.clubId,
        clubName: row.club?.name ?? null,
        maxRankSpan: row.maxRankSpan,
        playerCount: row.players.length,
        players: row.players.map((player) => ({
          userId: player.userId,
          rank: player.rank,
          points: player.points,
          name: displayName(player.user.profile),
        })),
      })),
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
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${body.clubId}))`;
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
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ladder:${id}`}))`;
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
      players: ladder.players.map((player) => ({
        userId: player.userId,
        rank: player.rank,
        points: player.points,
        name: displayName(player.user.profile),
      })),
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
    const rows = await prisma.matchOffer.findMany({
      where: {
        clubId: query.clubId,
        status: "PENDING",
        OR: [{ fromUserId: viewer.id }, { toUserId: viewer.id }],
      },
      include: {
        fromUser: { include: { profile: true } },
        toUser: { include: { profile: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        fromUserId: row.fromUserId,
        toUserId: row.toUserId,
        fromName: displayName(row.fromUser.profile),
        toName: displayName(row.toUser.profile),
        clubId: row.clubId,
        status: row.status,
      })),
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
    const onLadder = await prisma.ladderPlayer.findFirst({
      where: { userId: recipient.id, ladder: { clubId: club.id, deletedAt: null } },
    });
    if (!onLadder) throw new AppError(400, "VALIDATION_ERROR", "Bu oyuncu kulübün merdiveninde değil");
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`offer:${viewer.id}:${body.toUserId}:${body.clubId}`}))`;
      const existing = await tx.matchOffer.findFirst({
        where: { fromUserId: viewer.id, toUserId: body.toUserId, clubId: body.clubId, status: "PENDING" },
      });
      if (existing) return { offer: existing, created: false };
      const offer = await tx.matchOffer.create({
        data: { fromUserId: viewer.id, toUserId: body.toUserId, clubId: body.clubId, status: "PENDING" },
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
}
