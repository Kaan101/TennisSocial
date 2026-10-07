import type { Prisma } from "@prisma/client";
import { notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";

export type BoardPlayer = {
  userId: string;
  firstName: string;
  lastName: string;
  side: "A" | "B";
  mark: string;
};

export type BoardMatch = {
  id: string;
  source: "match" | "offer";
  scheduledAt: string;
  date: string;
  startTime: string;
  status: "SCHEDULED" | "COMPLETED";
  kind: "NORMAL" | "DEFI";
  score: string | null;
  winnerSide: "A" | "B" | null;
  winnerName: string | null;
  players: BoardPlayer[];
};

const matchInclude = {
  players: {
    include: { user: { include: { profile: true } } },
    orderBy: { side: "asc" as const },
  },
} satisfies Prisma.MatchInclude;

type MatchRow = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

/** First letter of the given name, a dot, first letter of the surname, a dot. Turkish letters stay. */
export function playerMark(firstName: string, lastName: string): string {
  const given = Array.from(firstName.trim())[0]?.toLocaleUpperCase("tr-TR") ?? "";
  const family = Array.from(lastName.trim())[0]?.toLocaleUpperCase("tr-TR") ?? "";
  if (given && family) return `${given}. ${family}.`;
  if (given) return `${given}.`;
  if (family) return `${family}.`;
  return "";
}

/** Calendar day and hour row in Europe/Istanbul. Minutes floor onto the hour. */
export function istanbulSlot(value: Date): { date: string; startTime: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  let hour = pick("hour");
  if (hour === "24") hour = "00";
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    startTime: `${hour.padStart(2, "0")}:00`,
  };
}

function namesOf(user: { profile: { firstName: string; lastName: string } | null }): { firstName: string; lastName: string } {
  return {
    firstName: user.profile?.firstName ?? "",
    lastName: user.profile?.lastName ?? "",
  };
}

function toPlayer(
  userId: string,
  user: { profile: { firstName: string; lastName: string } | null },
  side: "A" | "B",
): BoardPlayer {
  const names = namesOf(user);
  return {
    userId,
    firstName: names.firstName,
    lastName: names.lastName,
    side,
    mark: playerMark(names.firstName, names.lastName),
  };
}

function personName(player: BoardPlayer): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

function winnerName(players: BoardPlayer[], side: "A" | "B" | null): string | null {
  if (!side) return null;
  const names = players.filter((player) => player.side === side).map(personName).filter(Boolean);
  return names.length > 0 ? names.join(", ") : null;
}

/**
 * This club's ladder matches and court matches, plus matches that have no club
 * anchor yet (a group, a manual entry, or an accepted challenge). A match tied
 * to another club stays on that club.
 */
function boardWhere(clubId: string): Prisma.MatchWhereInput {
  return {
    deletedAt: null,
    status: { in: ["SCHEDULED", "COMPLETED"] },
    OR: [
      { ladder: { is: { clubId } } },
      { courtReservation: { is: { court: { clubId } } } },
      {
        AND: [
          { OR: [{ ladderId: null }, { ladder: { is: { clubId: null } } }] },
          { courtReservation: { is: null } },
        ],
      },
    ],
  };
}

function fromMatch(match: MatchRow): BoardMatch {
  const slot = istanbulSlot(match.scheduledAt);
  const players = match.players.map((player) => toPlayer(player.userId, player.user, player.side));
  const score = match.score?.trim() ? match.score.trim() : null;
  const winnerSide = match.winnerSide === "A" || match.winnerSide === "B" ? match.winnerSide : null;
  return {
    id: match.id,
    source: "match",
    scheduledAt: match.scheduledAt.toISOString(),
    date: slot.date,
    startTime: slot.startTime,
    status: match.status === "COMPLETED" ? "COMPLETED" : "SCHEDULED",
    kind: match.kind === "DEFI" ? "DEFI" : "NORMAL",
    score,
    winnerSide,
    winnerName: winnerName(players, winnerSide),
    players,
  };
}

export async function listMatchBoard(clubId: string | undefined): Promise<{ matches: BoardMatch[] }> {
  if (clubId) {
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw notFound("Kulüp bulunamadı");
  }

  const [matches, offers] = await Promise.all([
    prisma.match.findMany({
      where: clubId
        ? boardWhere(clubId)
        : {
            deletedAt: null,
            status: { in: ["SCHEDULED", "COMPLETED"] },
            ladderId: null,
            courtReservation: { is: null },
          },
      include: matchInclude,
    }),
    clubId
      ? prisma.matchOffer.findMany({
          where: {
            clubId,
            scheduledAt: { not: null },
            winnerId: null,
            status: { in: ["SCHEDULED", "ACCEPTED"] },
          },
          include: {
            fromUser: { include: { profile: true } },
            toUser: { include: { profile: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const rows: BoardMatch[] = matches.map(fromMatch);
  for (const offer of offers) {
    if (!offer.scheduledAt) continue;
    const slot = istanbulSlot(offer.scheduledAt);
    const players = [
      toPlayer(offer.fromUserId, offer.fromUser, "A"),
      toPlayer(offer.toUserId, offer.toUser, "B"),
    ];
    rows.push({
      id: offer.id,
      source: "offer",
      scheduledAt: offer.scheduledAt.toISOString(),
      date: slot.date,
      startTime: slot.startTime,
      status: "SCHEDULED",
      kind: "DEFI",
      score: null,
      winnerSide: null,
      winnerName: null,
      players,
    });
  }

  rows.sort((left, right) => {
    const delta = Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt);
    if (delta !== 0) return delta;
    return right.id.localeCompare(left.id);
  });
  return { matches: rows };
}
