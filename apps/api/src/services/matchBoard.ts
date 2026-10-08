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

const LIST_LIMIT = 40;

const matchInclude = {
  players: {
    orderBy: { side: "asc" as const },
    select: {
      userId: true,
      side: true,
      user: { select: { profile: { select: { firstName: true, lastName: true } } } },
    },
  },
} satisfies Prisma.MatchInclude;

const offerPlayers = {
  fromUser: { select: { profile: { select: { firstName: true, lastName: true } } } },
  toUser: { select: { profile: { select: { firstName: true, lastName: true } } } },
} as const;

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

function addIsoDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

function weekWindow(weekStart: string): { gte: Date; lt: Date } {
  return {
    gte: new Date(`${addIsoDays(weekStart, -1)}T00:00:00+03:00`),
    lt: new Date(`${addIsoDays(weekStart, 8)}T00:00:00+03:00`),
  };
}

function inWeek(date: string, weekStart: string): boolean {
  return date >= weekStart && date <= addIsoDays(weekStart, 6);
}

export async function listMatchBoard(clubId: string | undefined, weekStart?: string): Promise<{ matches: BoardMatch[] }> {
  if (clubId) {
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw notFound("Kulüp bulunamadı");
  }

  const matchWhere = clubId
    ? boardWhere(clubId)
    : {
        deletedAt: null,
        status: { in: ["SCHEDULED", "COMPLETED"] as ("SCHEDULED" | "COMPLETED")[] },
        ladderId: null,
        courtReservation: { is: null },
      };
  const offerWhere = {
    clubId: clubId ?? "",
    scheduledAt: { not: null },
    winnerId: null,
    status: { in: ["SCHEDULED", "ACCEPTED"] as ("SCHEDULED" | "ACCEPTED")[] },
  };
  const window = weekStart ? weekWindow(weekStart) : null;

  const [recentMatches, weekMatches, recentOffers, weekOffers] = await Promise.all([
    prisma.match.findMany({
      where: matchWhere,
      include: matchInclude,
      orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
      take: LIST_LIMIT,
    }),
    window
      ? prisma.match.findMany({
          where: { AND: [matchWhere, { scheduledAt: window }] },
          include: matchInclude,
        })
      : Promise.resolve([]),
    clubId
      ? prisma.matchOffer.findMany({
          where: offerWhere,
          select: {
            id: true,
            fromUserId: true,
            toUserId: true,
            scheduledAt: true,
            ...offerPlayers,
          },
          orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
          take: LIST_LIMIT,
        })
      : Promise.resolve([]),
    clubId && window
      ? prisma.matchOffer.findMany({
          where: { ...offerWhere, scheduledAt: window },
          select: {
            id: true,
            fromUserId: true,
            toUserId: true,
            scheduledAt: true,
            ...offerPlayers,
          },
        })
      : Promise.resolve([]),
  ]);

  const matches = [...recentMatches, ...weekMatches.filter((match) => !weekStart || inWeek(istanbulSlot(match.scheduledAt).date, weekStart))];
  const seenMatches = new Set<string>();
  const uniqueMatches = matches.filter((match) => {
    if (seenMatches.has(match.id)) return false;
    seenMatches.add(match.id);
    return true;
  });
  const offers = [...recentOffers, ...weekOffers.filter((offer) => offer.scheduledAt && (!weekStart || inWeek(istanbulSlot(offer.scheduledAt).date, weekStart)))];
  const seenOffers = new Set<string>();
  const uniqueOffers = offers.filter((offer) => {
    if (seenOffers.has(offer.id)) return false;
    seenOffers.add(offer.id);
    return true;
  });

  const rows: BoardMatch[] = uniqueMatches.map(fromMatch);
  for (const offer of uniqueOffers) {
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
