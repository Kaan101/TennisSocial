import type { FastifyInstance } from "fastify";
import { requireUser } from "../lib/authz";
import { notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";

export async function ladderRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/ladders", async (req) => {
    requireUser(req);
    const rows = await prisma.ladder.findMany({
      where: { deletedAt: null },
      include: { players: true },
      orderBy: { name: "asc" },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        maxRankSpan: row.maxRankSpan,
        playerCount: row.players.length,
      })),
    };
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
      maxRankSpan: ladder.maxRankSpan,
      players: ladder.players.map((player) => ({
        userId: player.userId,
        rank: player.rank,
        points: player.points,
        name: `${player.user.profile?.firstName ?? ""} ${player.user.profile?.lastName ?? ""}`.trim(),
      })),
      history: ladder.history.map((row) => ({
        id: row.id,
        userId: row.userId,
        name: `${row.user.profile?.firstName ?? ""} ${row.user.profile?.lastName ?? ""}`.trim(),
        previousRank: row.previousRank,
        newRank: row.newRank,
        previousPoints: row.previousPoints,
        newPoints: row.newPoints,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });
}
