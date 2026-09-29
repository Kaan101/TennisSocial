import type { OverallLevel, TournamentDivision, TournamentFormat } from "@club/shared";
import { levelIndex } from "@club/shared";
import { AppError, notFound } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { notifyMany } from "../notify";
import { planDraw, planKnockout, type DrawEntry, type PlannedMatch } from "./draw";
import { computeStandings, qualifierEntries } from "./standings";

const activeStatuses = ["REGISTERED", "CONFIRMED"] as const;

async function loadTournament(id: string) {
  const tournament = await prisma.tournament.findFirst({ where: { id, deletedAt: null } });
  if (!tournament) throw notFound("Turnuva bulunamadı");
  return tournament;
}

async function activePlayers(tournamentId: string) {
  return prisma.tournamentPlayer.findMany({
    where: { tournamentId, status: { in: [...activeStatuses] } },
    orderBy: [{ seed: "asc" }, { createdAt: "asc" }],
  });
}

function playerIds(match: {
  playerAId: string | null;
  playerAPartnerId: string | null;
  playerBId: string | null;
  playerBPartnerId: string | null;
}): string[] {
  return [match.playerAId, match.playerAPartnerId, match.playerBId, match.playerBPartnerId].filter((id): id is string => Boolean(id));
}

async function notifyAssigned(tournamentId: string, tournamentName: string, matches: { playerAId: string | null; playerAPartnerId: string | null; playerBId: string | null; playerBPartnerId: string | null; winnerId: string | null }[]): Promise<void> {
  const ids = matches.filter((match) => match.playerAId && match.playerBId && !match.winnerId).flatMap(playerIds);
  await notifyMany(ids, {
    type: "TOURNAMENT_MATCH_ASSIGNED",
    title: "Turnuva maçın belli oldu",
    body: `${tournamentName} eşleşmende yerin var.`,
    link: `/turnuvalar/${tournamentId}`,
  });
}

async function insertMatches(tournamentId: string, planned: PlannedMatch[]) {
  if (planned.length === 0) throw new AppError(400, "VALIDATION_ERROR", "Eşleşme üretilemedi");
  await prisma.tournamentMatch.createMany({
    data: planned.map((match) => ({
      tournamentId,
      stage: match.stage,
      groupKey: match.groupKey,
      round: match.round,
      position: match.position,
      playerAId: match.playerAId,
      playerAPartnerId: match.playerAPartnerId,
      playerBId: match.playerBId,
      playerBPartnerId: match.playerBPartnerId,
      winnerId: match.winnerId,
    })),
  });
}

export async function openTournamentNotifications(tournamentId: string, name: string, actorId: string): Promise<void> {
  const members = await prisma.user.findMany({
    where: { deletedAt: null, id: { not: actorId } },
    select: { id: true },
  });
  await notifyMany(
    members.map((member) => member.id),
    {
      type: "TOURNAMENT_OPENED",
      title: "Turnuva kayıtları açıldı",
      body: name,
      link: `/turnuvalar/${tournamentId}`,
    },
  );
}

export async function registerPlayer(tournamentId: string, userId: string): Promise<{ status: "REGISTERED" | "WAITING_LIST" }> {
  const tournament = await loadTournament(tournamentId);
  if (tournament.status !== "REGISTRATION_OPEN") throw new AppError(409, "CONFLICT", "Kayıtlar kapalı");
  if (tournament.registrationDeadline && tournament.registrationDeadline.getTime() < Date.now()) {
    throw new AppError(409, "CONFLICT", "Kayıt süresi doldu");
  }
  const tennis = await prisma.tennisProfile.findUnique({ where: { userId } });
  const level = (tennis?.overallLevel ?? "INTERMEDIATE") as OverallLevel;
  if (tournament.minLevel && levelIndex(level) < levelIndex(tournament.minLevel)) {
    throw new AppError(400, "VALIDATION_ERROR", "Seviyen bu turnuvanın aralığında değil");
  }
  if (tournament.maxLevel && levelIndex(level) > levelIndex(tournament.maxLevel)) {
    throw new AppError(400, "VALIDATION_ERROR", "Seviyen bu turnuvanın aralığında değil");
  }
  const existing = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  if (existing && (existing.status === "REGISTERED" || existing.status === "CONFIRMED" || existing.status === "WAITING_LIST")) {
    throw new AppError(409, "CONFLICT", existing.status === "WAITING_LIST" ? "Yedek listesindesin" : "Zaten kayıtlısın");
  }
  const taken = await prisma.tournamentPlayer.count({
    where: { tournamentId, status: { in: [...activeStatuses] } },
  });
  const waiting = tournament.maxPlayers != null && taken >= tournament.maxPlayers;
  const status = waiting ? "WAITING_LIST" : "REGISTERED";
  if (existing) {
    await prisma.tournamentPlayer.update({ where: { id: existing.id }, data: { status } });
  } else {
    await prisma.tournamentPlayer.create({ data: { tournamentId, userId, status } });
  }
  return { status };
}

export async function withdrawPlayer(tournamentId: string, userId: string): Promise<void> {
  const tournament = await loadTournament(tournamentId);
  const existing = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  if (!existing || existing.status === "WITHDRAWN") throw new AppError(409, "CONFLICT", "Kaydın yok");
  if (tournament.status === "COMPLETED") throw new AppError(409, "CONFLICT", "Bitmiş turnuvadan çıkılamaz");
  await prisma.tournamentPlayer.update({ where: { id: existing.id }, data: { status: "WITHDRAWN" } });
  if (existing.status === "WAITING_LIST") return;
  if (tournament.maxPlayers == null) return;
  const taken = await prisma.tournamentPlayer.count({
    where: { tournamentId, status: { in: [...activeStatuses] } },
  });
  if (taken >= tournament.maxPlayers) return;
  const next = await prisma.tournamentPlayer.findFirst({
    where: { tournamentId, status: "WAITING_LIST" },
    orderBy: { createdAt: "asc" },
  });
  if (next) {
    await prisma.tournamentPlayer.update({ where: { id: next.id }, data: { status: "REGISTERED" } });
    await notifyMany([next.userId], {
      type: "TOURNAMENT_OPENED",
      title: "Yedek listesinden çıktın",
      body: `${tournament.name} için yer açıldı.`,
      link: `/turnuvalar/${tournamentId}`,
    });
  }
}

export async function generateDraw(tournamentId: string) {
  const tournament = await loadTournament(tournamentId);
  const scored = await prisma.tournamentMatch.count({ where: { tournamentId, score: { not: null } } });
  if (scored > 0) throw new AppError(409, "CONFLICT", "Skor girilmiş tablo yeniden kurulamaz");
  const players = await activePlayers(tournamentId);
  let planned: PlannedMatch[];
  try {
    planned = planDraw({
      format: tournament.format,
      division: tournament.division,
      players,
      groupSize: tournament.groupSize,
    });
  } catch (error) {
    throw new AppError(400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Eşleşme kurulamadı");
  }
  await prisma.tournamentMatch.deleteMany({ where: { tournamentId } });
  await insertMatches(tournamentId, planned);
  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: "IN_PROGRESS" } });
  const created = await prisma.tournamentMatch.findMany({ where: { tournamentId } });
  await notifyAssigned(tournamentId, tournament.name, created);
  return created;
}

export async function generateKnockoutStage(tournamentId: string): Promise<void> {
  const tournament = await loadTournament(tournamentId);
  if (tournament.format !== "GROUPS_AND_KNOCKOUT") return;
  const existing = await prisma.tournamentMatch.count({ where: { tournamentId, stage: "KNOCKOUT" } });
  if (existing > 0) return;
  const groupMatches = await prisma.tournamentMatch.findMany({ where: { tournamentId, stage: "GROUP" } });
  if (groupMatches.length === 0 || groupMatches.some((match) => !match.winnerId && match.playerAId && match.playerBId)) return;
  const rows = computeStandings({
    matches: groupMatches,
    pointsWin: tournament.pointsWin,
    pointsLoss: tournament.pointsLoss,
    stage: "GROUP",
  });
  const entries: DrawEntry[] = qualifierEntries(rows, tournament.qualifiersPerGroup);
  const planned = planKnockout(entries);
  if (planned.length === 0) return;
  await insertMatches(tournamentId, planned);
  const created = await prisma.tournamentMatch.findMany({ where: { tournamentId, stage: "KNOCKOUT" } });
  await notifyAssigned(tournamentId, tournament.name, created);
}

export async function recordTournamentResult(input: {
  tournamentId: string;
  matchId: string;
  score: string;
  winnerSide: "A" | "B";
}): Promise<void> {
  const tournament = await loadTournament(input.tournamentId);
  const match = await prisma.tournamentMatch.findFirst({ where: { id: input.matchId, tournamentId: input.tournamentId } });
  if (!match) throw notFound("Maç bulunamadı");
  if (match.winnerId) throw new AppError(409, "CONFLICT", "Bu maçın skoru girilmiş");
  if (!match.playerAId || !match.playerBId) throw new AppError(409, "CONFLICT", "Rakipler henüz belli değil");
  const winnerId = input.winnerSide === "A" ? match.playerAId : match.playerBId;
  const winnerPartner = input.winnerSide === "A" ? match.playerAPartnerId : match.playerBPartnerId;
  await prisma.tournamentMatch.update({
    where: { id: match.id },
    data: { score: input.score, winnerId },
  });
  if (match.stage === "KNOCKOUT") {
    const next = await prisma.tournamentMatch.findFirst({
      where: {
        tournamentId: input.tournamentId,
        stage: "KNOCKOUT",
        groupKey: match.groupKey,
        round: match.round + 1,
        position: Math.floor(match.position / 2),
      },
    });
    if (next) {
      const data = match.position % 2 === 0
        ? { playerAId: winnerId, playerAPartnerId: winnerPartner }
        : { playerBId: winnerId, playerBPartnerId: winnerPartner };
      const updated = await prisma.tournamentMatch.update({ where: { id: next.id }, data });
      if (updated.playerAId && updated.playerBId) {
        await notifyAssigned(input.tournamentId, tournament.name, [updated]);
      }
    } else {
      await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "COMPLETED" } });
    }
  }
  if (tournament.format === "GROUPS_AND_KNOCKOUT" && match.stage === "GROUP") {
    await generateKnockoutStage(input.tournamentId);
  }
}

export type { TournamentFormat, TournamentDivision };
