import type { FastifyInstance } from "fastify";
import {
  LEVEL_LABELS,
  SET_FORMAT_LABELS,
  TOURNAMENT_DIVISION_LABELS,
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_PLAYER_STATUS_LABELS,
  TOURNAMENT_STATUS_LABELS,
  paginationSchema,
  tournamentCreateSchema,
  tournamentPointsSchema,
  tournamentRegisterSchema,
  tournamentResultSchema,
  tournamentUpdateSchema,
} from "@club/shared";
import type { Prisma } from "@prisma/client";
import { assertRole, requireUser } from "../lib/authz";
import { parseDateOnly } from "../lib/dates";
import { forbidden, notFound, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { roundLabel } from "../services/tournaments/draw";
import { computeStandings } from "../services/tournaments/standings";
import { recordActivity } from "../services/activity";
import {
  generateDraw,
  openTournamentNotifications,
  recordTournamentResult,
  registerPlayer,
  withdrawPlayer,
} from "../services/tournaments/service";

const managers = ["CLUB_MANAGER", "TOURNAMENT_MANAGER"] as const;

const profileInclude = { include: { profile: true } } as const;

function fullName(user: { profile: { firstName: string; lastName: string } | null } | null): string {
  if (!user?.profile) return "Belirsiz";
  return `${user.profile.firstName} ${user.profile.lastName}`.trim();
}

function sideName(
  user: { profile: { firstName: string; lastName: string } | null } | null,
  partner: { profile: { firstName: string; lastName: string } | null } | null,
): string {
  if (!user) return "Bekleniyor";
  const name = fullName(user);
  return partner ? `${name} / ${fullName(partner)}` : name;
}

const matchInclude = {
  playerA: profileInclude,
  playerAPartner: profileInclude,
  playerB: profileInclude,
  playerBPartner: profileInclude,
} satisfies Prisma.TournamentMatchInclude;

function deadlineDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T23:59:59.000Z`);
}

export async function tournamentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/tournaments", async (req) => {
    const viewer = requireUser(req);
    const query = parse(paginationSchema, req.query);
    const where = { deletedAt: null };
    const [total, rows] = await Promise.all([
      prisma.tournament.count({ where }),
      prisma.tournament.findMany({
        where,
        include: { players: true },
        orderBy: { startDate: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
        registrationDeadline: row.registrationDeadline ? row.registrationDeadline.toISOString().slice(0, 10) : null,
        status: row.status,
        statusLabel: TOURNAMENT_STATUS_LABELS[row.status],
        format: row.format,
        formatLabel: TOURNAMENT_FORMAT_LABELS[row.format],
        division: row.division,
        divisionLabel: TOURNAMENT_DIVISION_LABELS[row.division],
        location: row.location,
        maxPlayers: row.maxPlayers,
        playerCount: row.players.filter((player) => player.status === "REGISTERED" || player.status === "CONFIRMED").length,
        waitingCount: row.players.filter((player) => player.status === "WAITING_LIST").length,
        joined: row.players.some((player) => player.userId === viewer.id && player.status !== "WITHDRAWN"),
      })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  });

  app.post("/api/tournaments", async (req, reply) => {
    const viewer = requireUser(req);
    assertRole(viewer, [...managers]);
    const body = parse(tournamentCreateSchema, req.body);
    const tournament = await prisma.tournament.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        startDate: parseDateOnly(body.startDate),
        endDate: body.endDate ? parseDateOnly(body.endDate) : null,
        registrationDeadline: deadlineDate(body.registrationDeadline),
        status: body.status,
        format: body.format,
        division: body.division,
        location: body.location ?? null,
        maxPlayers: body.maxPlayers ?? null,
        minLevel: body.minLevel ?? null,
        maxLevel: body.maxLevel ?? null,
        courts: body.courts ?? [],
        setFormat: body.setFormat,
        rules: body.rules ?? null,
        pointsWin: body.pointsWin ?? 3,
        pointsLoss: body.pointsLoss ?? 0,
        groupSize: body.groupSize ?? 4,
        qualifiersPerGroup: body.qualifiersPerGroup ?? 2,
        groupId: body.groupId ?? null,
        createdById: viewer.id,
      },
    });
    if (tournament.status === "REGISTRATION_OPEN") {
      await openTournamentNotifications(tournament.id, tournament.name, viewer.id);
    }
    await recordActivity({
      actorId: viewer.id,
      type: "TOURNAMENT_CREATED",
      title: "Yeni turnuva",
      body: tournament.name,
      link: `/turnuvalar/${tournament.id}`,
    });
    return reply.status(201).send({ id: tournament.id });
  });

  app.get("/api/tournaments/:id", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const tournament = await prisma.tournament.findFirst({
      where: { id, deletedAt: null },
      include: {
        players: { include: { user: { include: { profile: true, tennisProfile: true } } }, orderBy: { createdAt: "asc" } },
        matches: { include: matchInclude, orderBy: [{ stage: "asc" }, { groupKey: "asc" }, { round: "asc" }, { position: "asc" }] },
      },
    });
    if (!tournament) throw notFound("Turnuva bulunamadı");
    const canManage = viewer.role === "ADMIN" || viewer.role === "CLUB_MANAGER" || viewer.role === "TOURNAMENT_MANAGER";
    const names = new Map(tournament.players.map((player) => [player.userId, fullName(player.user)]));
    const maxByStage = new Map<string, number>();
    for (const match of tournament.matches) {
      const key = `${match.stage}:${match.groupKey}`;
      maxByStage.set(key, Math.max(maxByStage.get(key) ?? 1, match.round));
    }
    const standings = computeStandings({
      matches: tournament.matches,
      pointsWin: tournament.pointsWin,
      pointsLoss: tournament.pointsLoss,
      stage: tournament.format === "AMERICANO" ? "AMERICANO" : "GROUP",
      individual: tournament.format === "AMERICANO",
    }).map((row) => ({
      ...row,
      name: row.partnerId ? `${names.get(row.userId) ?? "Oyuncu"} / ${names.get(row.partnerId) ?? "Partner"}` : names.get(row.userId) ?? "Oyuncu",
    }));
    const mine = tournament.players.find((player) => player.userId === viewer.id);
    return {
      id: tournament.id,
      name: tournament.name,
      description: tournament.description,
      startDate: tournament.startDate.toISOString().slice(0, 10),
      endDate: tournament.endDate ? tournament.endDate.toISOString().slice(0, 10) : null,
      registrationDeadline: tournament.registrationDeadline ? tournament.registrationDeadline.toISOString().slice(0, 10) : null,
      status: tournament.status,
      statusLabel: TOURNAMENT_STATUS_LABELS[tournament.status],
      format: tournament.format,
      formatLabel: TOURNAMENT_FORMAT_LABELS[tournament.format],
      division: tournament.division,
      divisionLabel: TOURNAMENT_DIVISION_LABELS[tournament.division],
      location: tournament.location,
      maxPlayers: tournament.maxPlayers,
      minLevel: tournament.minLevel,
      maxLevel: tournament.maxLevel,
      minLevelLabel: tournament.minLevel ? LEVEL_LABELS[tournament.minLevel] : null,
      maxLevelLabel: tournament.maxLevel ? LEVEL_LABELS[tournament.maxLevel] : null,
      courts: tournament.courts,
      setFormat: tournament.setFormat,
      setFormatLabel: SET_FORMAT_LABELS[tournament.setFormat],
      rules: tournament.rules,
      pointsWin: tournament.pointsWin,
      pointsLoss: tournament.pointsLoss,
      groupSize: tournament.groupSize,
      qualifiersPerGroup: tournament.qualifiersPerGroup,
      canManage,
      myStatus: mine?.status ?? null,
      players: tournament.players.map((player) => ({
        userId: player.userId,
        seed: player.seed,
        status: player.status,
        statusLabel: TOURNAMENT_PLAYER_STATUS_LABELS[player.status],
        name: fullName(player.user),
        level: player.user.tennisProfile?.overallLevel ?? null,
      })),
      matches: tournament.matches.map((match) => {
        const involved = [match.playerAId, match.playerAPartnerId, match.playerBId, match.playerBPartnerId].includes(viewer.id);
        return {
          id: match.id,
          stage: match.stage,
          groupKey: match.groupKey,
          round: match.round,
          position: match.position,
          roundLabel: roundLabel(match.round, maxByStage.get(`${match.stage}:${match.groupKey}`) ?? match.round, match.stage),
          playerAId: match.playerAId,
          playerBId: match.playerBId,
          sideA: sideName(match.playerA, match.playerAPartner),
          sideB: sideName(match.playerB, match.playerBPartner),
          winnerId: match.winnerId,
          score: match.score,
          court: match.court,
          canScore: !match.winnerId && Boolean(match.playerAId && match.playerBId) && (canManage || involved),
        };
      }),
      standings,
      champion: (() => {
        const finals = tournament.matches.filter((match) => match.stage === "KNOCKOUT");
        const max = finals.reduce((highest, match) => Math.max(highest, match.round), 0);
        const final = finals.find((match) => match.round === max && match.position === 0 && match.winnerId);
        if (!final?.winnerId) return null;
        const wonA = final.winnerId === final.playerAId;
        return wonA ? sideName(final.playerA, final.playerAPartner) : sideName(final.playerB, final.playerBPartner);
      })(),
    };
  });

  app.patch("/api/tournaments/:id", async (req) => {
    const viewer = requireUser(req);
    assertRole(viewer, [...managers]);
    const { id } = req.params as { id: string };
    const body = parse(tournamentUpdateSchema, req.body);
    const current = await prisma.tournament.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound("Turnuva bulunamadı");
    const updated = await prisma.tournament.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        startDate: body.startDate ? parseDateOnly(body.startDate) : undefined,
        endDate: body.endDate === undefined ? undefined : body.endDate ? parseDateOnly(body.endDate) : null,
        registrationDeadline: body.registrationDeadline === undefined ? undefined : deadlineDate(body.registrationDeadline),
        status: body.status,
        format: body.format,
        division: body.division,
        location: body.location,
        maxPlayers: body.maxPlayers,
        minLevel: body.minLevel,
        maxLevel: body.maxLevel,
        courts: body.courts,
        setFormat: body.setFormat,
        rules: body.rules,
        pointsWin: body.pointsWin,
        pointsLoss: body.pointsLoss,
        groupSize: body.groupSize,
        qualifiersPerGroup: body.qualifiersPerGroup,
        groupId: body.groupId,
      },
    });
    if (body.status === "REGISTRATION_OPEN" && current.status !== "REGISTRATION_OPEN") {
      await openTournamentNotifications(updated.id, updated.name, viewer.id);
    }
    return { id: updated.id };
  });

  app.post("/api/tournaments/:id/players", async (req, reply) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(tournamentRegisterSchema, req.body ?? {});
    const userId = body.userId ?? viewer.id;
    if (userId !== viewer.id) assertRole(viewer, [...managers]);
    const result = await registerPlayer(id, userId);
    const tournament = await prisma.tournament.findFirst({ where: { id }, select: { name: true } });
    await recordActivity({
      actorId: userId,
      type: "TOURNAMENT_JOIN",
      title: result.status === "WAITING_LIST" ? "Yedek listesine yazıldı" : "Turnuvaya katıldı",
      body: tournament?.name ?? "Turnuva",
      link: `/turnuvalar/${id}`,
    });
    return reply.status(201).send(result);
  });

  app.post("/api/tournaments/:id/withdraw", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(tournamentRegisterSchema, req.body ?? {});
    const userId = body.userId ?? viewer.id;
    if (userId !== viewer.id) assertRole(viewer, [...managers]);
    await withdrawPlayer(id, userId);
    return { ok: true };
  });

  app.post("/api/tournaments/:id/draw", async (req) => {
    const viewer = requireUser(req);
    assertRole(viewer, [...managers]);
    const { id } = req.params as { id: string };
    const matches = await generateDraw(id);
    return { ok: true, matchCount: matches.length };
  });

  app.patch("/api/tournaments/:id/points", async (req) => {
    const viewer = requireUser(req);
    assertRole(viewer, [...managers]);
    const { id } = req.params as { id: string };
    const body = parse(tournamentPointsSchema, req.body);
    const tournament = await prisma.tournament.findFirst({ where: { id, deletedAt: null } });
    if (!tournament) throw notFound("Turnuva bulunamadı");
    await prisma.tournament.update({ where: { id }, data: { pointsWin: body.pointsWin, pointsLoss: body.pointsLoss } });
    return { ok: true };
  });

  app.post("/api/tournaments/:id/matches/:matchId/result", async (req) => {
    const viewer = requireUser(req);
    const { id, matchId } = req.params as { id: string; matchId: string };
    const body = parse(tournamentResultSchema, req.body);
    const match = await prisma.tournamentMatch.findFirst({ where: { id: matchId, tournamentId: id } });
    if (!match) throw notFound("Maç bulunamadı");
    const canManage = viewer.role === "ADMIN" || viewer.role === "CLUB_MANAGER" || viewer.role === "TOURNAMENT_MANAGER";
    const involved = [match.playerAId, match.playerAPartnerId, match.playerBId, match.playerBPartnerId].includes(viewer.id);
    if (!canManage && !involved) throw forbidden();
    await recordTournamentResult({ tournamentId: id, matchId, score: body.score, winnerSide: body.winnerSide });
    return { ok: true };
  });
}
