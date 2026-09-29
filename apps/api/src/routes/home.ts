import type { FastifyInstance } from "fastify";
import { SET_FORMAT_LABELS, formatTrDay, istanbulNowParts } from "@club/shared";
import { requireUser } from "../lib/authz";
import { prisma } from "../lib/prisma";
import { matchInclude, toMatchSummary } from "../services/present";
import { listActivity } from "../services/activity";
import { matchmaker } from "../services/matchmaking/service";
import { searchPlayers } from "../services/search";

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/home", async (req) => {
    const viewer = requireUser(req);
    const me = await prisma.user.findUnique({ where: { id: viewer.id }, include: { profile: true } });
    const today = istanbulNowParts();
    const [available, upcoming, challenges, tournaments, announcements, suggested, activity] = await Promise.all([
      searchPlayers(viewer, { page: 1, pageSize: 8, availableToday: true }),
      prisma.match.findMany({
        where: {
          deletedAt: null,
          status: "SCHEDULED",
          scheduledAt: { gte: new Date() },
          players: { some: { userId: viewer.id } },
        },
        include: matchInclude,
        orderBy: { scheduledAt: "asc" },
        take: 5,
      }),
      prisma.challenge.findMany({
        where: {
          deletedAt: null,
          status: { in: ["PENDING", "COUNTERED"] },
          OR: [{ challengerId: viewer.id }, { recipientId: viewer.id }, { awaitingUserId: viewer.id }],
        },
        include: { challenger: { include: { profile: true } }, recipient: { include: { profile: true } } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.tournament.findMany({
        where: { deletedAt: null, status: { in: ["REGISTRATION_OPEN", "IN_PROGRESS"] } },
        orderBy: { startDate: "asc" },
        take: 4,
      }),
      prisma.announcement.findMany({
        where: { deletedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        include: { author: { include: { profile: true } } },
        orderBy: { publishedAt: "desc" },
        take: 4,
      }),
      matchmaker.suggest(viewer.id, 4),
      listActivity(viewer, 5),
    ]);
    const openChallenges = await prisma.challenge.count({
      where: {
        deletedAt: null,
        status: { in: ["PENDING", "COUNTERED"] },
        OR: [{ awaitingUserId: viewer.id }, { challengerId: viewer.id }, { recipientId: viewer.id }],
      },
    });
    return {
      greetingName: me?.profile?.firstName ?? "",
      dateLabel: formatTrDay(new Date(`${today.day}T12:00:00+03:00`)),
      stats: {
        availableToday: available.meta.total,
        upcomingMatches: await prisma.match.count({
          where: {
            deletedAt: null,
            status: "SCHEDULED",
            scheduledAt: { gte: new Date() },
            players: { some: { userId: viewer.id } },
          },
        }),
        openChallenges,
        activeTournaments: await prisma.tournament.count({
          where: { deletedAt: null, status: { in: ["REGISTRATION_OPEN", "IN_PROGRESS"] } },
        }),
      },
      availableToday: available.data,
      upcomingMatches: upcoming.map((match) => toMatchSummary(match, viewer.id, viewer.role)),
      newChallenges: challenges.map((challenge) => ({
        id: challenge.id,
        format: challenge.format,
        formatLabel: challenge.format === "SINGLE" ? "Tekler" : "Çiftler",
        status: challenge.status,
        proposedDate: challenge.proposedDate.toISOString().slice(0, 10),
        proposedTime: challenge.proposedTime,
        counterDate: challenge.counterDate ? challenge.counterDate.toISOString().slice(0, 10) : null,
        counterTime: challenge.counterTime,
        counterNote: challenge.counterNote,
        court: challenge.court,
        setFormat: challenge.setFormat,
        setFormatLabel: SET_FORMAT_LABELS[challenge.setFormat],
        note: challenge.note,
        challenger: {
          id: challenge.challengerId,
          name: `${challenge.challenger.profile?.firstName ?? ""} ${challenge.challenger.profile?.lastName ?? ""}`.trim(),
        },
        recipient: {
          id: challenge.recipientId,
          name: `${challenge.recipient.profile?.firstName ?? ""} ${challenge.recipient.profile?.lastName ?? ""}`.trim(),
        },
        awaitingUserId: challenge.awaitingUserId,
        matchId: challenge.matchId,
        canRespond: challenge.awaitingUserId === viewer.id,
        canCancel: challenge.challengerId === viewer.id,
      })),
      tournaments: tournaments.map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        startDate: tournament.startDate.toISOString().slice(0, 10),
        location: tournament.location,
      })),
      announcements: announcements.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        publishedAt: item.publishedAt.toISOString(),
        authorName: `${item.author.profile?.firstName ?? ""} ${item.author.profile?.lastName ?? ""}`.trim(),
      })),
      suggested,
      activity,
    };
  });
}
