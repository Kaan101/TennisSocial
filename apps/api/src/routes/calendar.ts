import type { FastifyInstance } from "fastify";
import { requireUser } from "../lib/authz";
import { prisma } from "../lib/prisma";
import { buildIcs } from "../services/calendar";

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/calendar.ics", async (req, reply) => {
    const viewer = requireUser(req);
    const matches = await prisma.match.findMany({
      where: {
        deletedAt: null,
        status: "SCHEDULED",
        scheduledAt: { gte: new Date() },
        players: { some: { userId: viewer.id } },
      },
      include: { players: { include: { user: { include: { profile: true } } } } },
      orderBy: { scheduledAt: "asc" },
    });
    const ics = buildIcs(
      matches.map((match) => {
        const others = match.players
          .filter((player) => player.userId !== viewer.id)
          .map((player) => `${player.user.profile?.firstName ?? ""} ${player.user.profile?.lastName ?? ""}`.trim())
          .filter(Boolean);
        const start = match.scheduledAt;
        return {
          id: match.id,
          title: others.length ? `Tenis: ${others.join(", ")}` : "Tenis maçı",
          start,
          end: new Date(start.getTime() + 90 * 60 * 1000),
          location: match.court,
          description: match.note,
        };
      }),
    );
    return reply
      .header("content-type", "text/calendar; charset=utf-8")
      .header("content-disposition", 'attachment; filename="kort.ics"')
      .send(ics);
  });
}
