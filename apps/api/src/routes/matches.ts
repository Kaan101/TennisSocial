import type { FastifyInstance } from "fastify";
import { matchCreateSchema, matchResultSchema, paginationSchema } from "@club/shared";
import { z } from "zod";
import { writeAudit } from "../lib/audit";
import { requireUser } from "../lib/authz";
import { combineIstanbul } from "../lib/dates";
import { AppError, forbidden, notFound, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { recordActivity } from "../services/activity";
import { applyLadderMatchResult } from "../services/ladders";
import { notify } from "../services/notify";
import { areFriends } from "../services/friends";
import { listMatchBoard } from "../services/matchBoard";
import { matchInclude, toMatchSummary, toUserDetail, userInclude } from "../services/present";

export async function matchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/matches", async (req) => {
    const viewer = requireUser(req);
    const query = parse(
      paginationSchema.extend({
        userId: z.string().optional(),
        scope: z.enum(["mine", "all"]).default("mine"),
      }),
      req.query,
    );
    if (query.userId && query.userId !== viewer.id) {
      const owner = await prisma.user.findFirst({ where: { id: query.userId, deletedAt: null }, include: userInclude });
      if (!owner) throw notFound("Üye bulunamadı");
      const friend = await areFriends(viewer.id, owner.id);
      const { detail } = await toUserDetail(owner, viewer, friend);
      if (!detail.permissions.canViewMatches) throw forbidden("Maç geçmişi gizli");
    }
    const where = {
      deletedAt: null,
      ...(query.scope === "all" && (viewer.role === "ADMIN" || viewer.role === "CLUB_MANAGER")
        ? {}
        : { players: { some: { userId: query.userId ?? viewer.id } } }),
    };
    const [total, rows] = await Promise.all([
      prisma.match.count({ where }),
      prisma.match.findMany({
        where,
        include: matchInclude,
        orderBy: { scheduledAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map((row) => toMatchSummary(row, viewer.id, viewer.role)),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  });

  app.post("/api/matches", async (req, reply) => {
    const viewer = requireUser(req);
    const body = parse(matchCreateSchema, req.body);
    const expected = body.format === "SINGLE" ? 2 : 4;
    if (body.players.length !== expected) {
      throw new AppError(400, "VALIDATION_ERROR", body.format === "SINGLE" ? "Tekler maçında 2 oyuncu olmalı" : "Çiftler maçında 4 oyuncu olmalı");
    }
    const ids = body.players.map((player) => player.userId);
    if (new Set(ids).size !== ids.length) throw new AppError(400, "VALIDATION_ERROR", "Oyuncular tekrar edemez");
    const sideA = body.players.filter((player) => player.side === "A").length;
    const sideB = body.players.filter((player) => player.side === "B").length;
    if (sideA !== sideB) throw new AppError(400, "VALIDATION_ERROR", "İki tarafın oyuncu sayısı eşit olmalı");
    if (!ids.includes(viewer.id) && viewer.role === "MEMBER") {
      throw forbidden("Yalnızca kendi maçını oluşturabilirsin");
    }
    const found = await prisma.user.count({ where: { id: { in: ids }, deletedAt: null } });
    if (found !== ids.length) throw notFound("Oyuncu bulunamadı");
    const match = await prisma.match.create({
      data: {
        format: body.format,
        scheduledAt: combineIstanbul(body.scheduledDate, body.scheduledTime),
        court: body.court ?? null,
        setFormat: body.setFormat,
        note: body.note ?? null,
        groupId: body.groupId ?? null,
        createdById: viewer.id,
        players: { create: body.players },
      },
      include: matchInclude,
    });
    await Promise.all(
      ids
        .filter((id) => id !== viewer.id)
        .map((id) =>
          notify({
            userId: id,
            type: "MATCH_SCHEDULED",
            title: "Yeni maç",
            body: "Takvimine bir maç eklendi.",
            link: `/maclar/${match.id}`,
          }),
        ),
    );
    return reply.status(201).send(toMatchSummary(match, viewer.id, viewer.role));
  });

  app.get("/api/matches/board", async (req) => {
    requireUser(req);
    const query = parse(z.object({
      club: z.string().min(1).optional(),
      week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }), req.query);
    return listMatchBoard(query.club, query.week);
  });

  app.get("/api/matches/:id", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const match = await prisma.match.findFirst({ where: { id, deletedAt: null }, include: matchInclude });
    if (!match) throw notFound("Maç bulunamadı");
    const involved = match.players.some((player) => player.userId === viewer.id);
    if (!involved && viewer.role !== "ADMIN" && viewer.role !== "CLUB_MANAGER") {
      const hidden = await Promise.all(
        match.players.map(async (player) => {
          const user = await prisma.user.findFirst({ where: { id: player.userId }, include: userInclude });
          if (!user) return true;
          const friend = await areFriends(viewer.id, player.userId);
          const { detail } = await toUserDetail(user, viewer, friend);
          return !detail.permissions.canViewMatches;
        }),
      );
      if (hidden.some(Boolean)) throw forbidden("Maç geçmişi gizli");
    }
    return toMatchSummary(match, viewer.id, viewer.role);
  });

  app.patch("/api/matches/:id/result", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(matchResultSchema, req.body);
    const match = await prisma.match.findFirst({ where: { id, deletedAt: null }, include: matchInclude });
    if (!match) throw notFound("Maç bulunamadı");
    if (match.status === "CANCELLED") throw new AppError(409, "CONFLICT", "İptal edilen maça skor girilemez");
    const involved = match.players.some((player) => player.userId === viewer.id);
    if (!involved && viewer.role !== "ADMIN" && viewer.role !== "CLUB_MANAGER") throw forbidden();
    const updated = await prisma.match.update({
      where: { id },
      data: { score: body.score, winnerSide: body.winnerSide, note: body.note ?? match.note, status: "COMPLETED" },
      include: matchInclude,
    });
    await Promise.all(
      match.players
        .filter((player) => player.userId !== viewer.id)
        .map((player) =>
          notify({
            userId: player.userId,
            type: "MATCH_RESULT",
            title: "Maç sonucu işlendi",
            body: body.score,
            link: `/maclar/${id}`,
          }),
        ),
    );
    await Promise.all(
      updated.players.map((player) => {
        const opponents = updated.players
          .filter((other) => other.side !== player.side)
          .map((other) => `${other.user.profile?.firstName ?? ""} ${other.user.profile?.lastName ?? ""}`.trim())
          .filter(Boolean);
        return recordActivity({
          actorId: player.userId,
          type: "MATCH_RECORDED",
          title: "Maç sonucu işlendi",
          body: `${body.score}${opponents.length ? ` · ${opponents.join(", ")}` : ""}`,
          link: `/maclar/${id}`,
        });
      }),
    );
    if (updated.ladderId && updated.winnerSide) {
      const winners = updated.players.filter((player) => player.side === updated.winnerSide).map((player) => player.userId);
      const losers = updated.players.filter((player) => player.side !== updated.winnerSide).map((player) => player.userId);
      if (winners.length === 1 && losers.length === 1 && winners[0] && losers[0]) {
        await applyLadderMatchResult({ ladderId: updated.ladderId, winnerId: winners[0], loserId: losers[0] });
      }
    }
    return toMatchSummary(updated, viewer.id, viewer.role);
  });

  app.post("/api/matches/:id/cancel", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const match = await prisma.match.findFirst({ where: { id, deletedAt: null }, include: matchInclude });
    if (!match) throw notFound("Maç bulunamadı");
    const involved = match.players.some((player) => player.userId === viewer.id);
    if (!involved && viewer.role !== "ADMIN" && viewer.role !== "CLUB_MANAGER") throw forbidden();
    if (match.status === "COMPLETED") throw new AppError(409, "CONFLICT", "Sonuçlanmış maç iptal edilemez");
    const updated = await prisma.match.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: matchInclude,
    });
    return toMatchSummary(updated, viewer.id, viewer.role);
  });

  app.delete("/api/matches/:id", async (req) => {
    const viewer = requireUser(req);
    if (viewer.role !== "ADMIN" && viewer.role !== "CLUB_MANAGER") throw forbidden();
    const { id } = req.params as { id: string };
    const match = await prisma.match.findFirst({ where: { id, deletedAt: null } });
    if (!match) throw notFound("Maç bulunamadı");
    await prisma.match.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit({ actorId: viewer.id, action: "MATCH_SOFT_DELETE", entityType: "Match", entityId: id });
    return { ok: true };
  });
}
