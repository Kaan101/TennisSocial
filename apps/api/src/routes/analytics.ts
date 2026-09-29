import type { FastifyInstance } from "fastify";
import { assertRole, requireUser } from "../lib/authz";
import { prisma } from "../lib/prisma";

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/analytics", async (req) => {
    const viewer = requireUser(req);
    assertRole(viewer, ["CLUB_MANAGER"]);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [memberCount, activePlayers, matchesLast30Days, openChallenges, tournaments] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.profile.count({ where: { deletedAt: null, playerStatus: "ACTIVE" } }),
      prisma.match.count({ where: { deletedAt: null, status: "COMPLETED", scheduledAt: { gte: since } } }),
      prisma.challenge.count({ where: { deletedAt: null, status: { in: ["PENDING", "COUNTERED"] } } }),
      prisma.tournament.findMany({
        where: { deletedAt: null, status: { in: ["REGISTRATION_OPEN", "IN_PROGRESS"] } },
        include: { players: { where: { status: { in: ["REGISTERED", "CONFIRMED"] } } } },
        orderBy: { startDate: "asc" },
      }),
    ]);
    return {
      memberCount,
      activePlayers,
      matchesLast30Days,
      openChallenges,
      tournaments: tournaments.map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        registered: tournament.players.length,
        cap: tournament.maxPlayers,
        fill: tournament.maxPlayers ? Math.round((tournament.players.length / tournament.maxPlayers) * 100) : null,
      })),
    };
  });
}
