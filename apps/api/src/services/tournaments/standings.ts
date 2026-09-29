import type { DrawEntry } from "./draw";

export type StandingRow = {
  userId: string;
  partnerId: string | null;
  groupKey: string;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
};

export type ScoreParts = { gamesA: number; gamesB: number; setsA: number; setsB: number };

export function parseScore(score: string | null | undefined): ScoreParts {
  const empty = { gamesA: 0, gamesB: 0, setsA: 0, setsB: 0 };
  if (!score) return empty;
  for (const set of score.trim().split(/\s+/)) {
    const [left, right] = set.split("-").map((part) => Number(part));
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    empty.gamesA += left;
    empty.gamesB += right;
    if (left > right) empty.setsA += 1;
    else if (right > left) empty.setsB += 1;
  }
  return empty;
}

type StandingMatch = {
  stage: string;
  groupKey: string;
  playerAId: string | null;
  playerAPartnerId: string | null;
  playerBId: string | null;
  playerBPartnerId: string | null;
  winnerId: string | null;
  score: string | null;
};

function keyOf(userId: string, partnerId: string | null, groupKey: string): string {
  return `${groupKey}|${userId}|${partnerId ?? ""}`;
}

function ensure(map: Map<string, StandingRow>, userId: string, partnerId: string | null, groupKey: string): StandingRow {
  const key = keyOf(userId, partnerId, groupKey);
  const existing = map.get(key);
  if (existing) return existing;
  const row: StandingRow = {
    userId,
    partnerId,
    groupKey,
    played: 0,
    won: 0,
    lost: 0,
    setsWon: 0,
    setsLost: 0,
    gamesWon: 0,
    gamesLost: 0,
    points: 0,
  };
  map.set(key, row);
  return row;
}

export function computeStandings(input: {
  matches: StandingMatch[];
  pointsWin: number;
  pointsLoss: number;
  stage?: string;
  individual?: boolean;
}): StandingRow[] {
  const map = new Map<string, StandingRow>();
  const matches = input.matches.filter((match) => (input.stage ? match.stage === input.stage : true) && match.winnerId && match.playerAId && match.playerBId);
  for (const match of matches) {
    const parts = parseScore(match.score);
    const aWon = match.winnerId === match.playerAId;
    if (input.individual) {
      const sideA = [match.playerAId, match.playerAPartnerId].filter((id): id is string => Boolean(id));
      const sideB = [match.playerBId, match.playerBPartnerId].filter((id): id is string => Boolean(id));
      for (const id of sideA) {
        const row = ensure(map, id, null, match.groupKey);
        row.played += 1;
        row.gamesWon += parts.gamesA;
        row.gamesLost += parts.gamesB;
        row.points += parts.gamesA;
        if (aWon) row.won += 1;
        else row.lost += 1;
      }
      for (const id of sideB) {
        const row = ensure(map, id, null, match.groupKey);
        row.played += 1;
        row.gamesWon += parts.gamesB;
        row.gamesLost += parts.gamesA;
        row.points += parts.gamesB;
        if (!aWon) row.won += 1;
        else row.lost += 1;
      }
      continue;
    }
    const a = ensure(map, match.playerAId!, match.playerAPartnerId, match.groupKey);
    const b = ensure(map, match.playerBId!, match.playerBPartnerId, match.groupKey);
    a.played += 1;
    b.played += 1;
    a.setsWon += parts.setsA;
    a.setsLost += parts.setsB;
    b.setsWon += parts.setsB;
    b.setsLost += parts.setsA;
    a.gamesWon += parts.gamesA;
    a.gamesLost += parts.gamesB;
    b.gamesWon += parts.gamesB;
    b.gamesLost += parts.gamesA;
    if (aWon) {
      a.won += 1;
      b.lost += 1;
      a.points += input.pointsWin;
      b.points += input.pointsLoss;
    } else {
      b.won += 1;
      a.lost += 1;
      b.points += input.pointsWin;
      a.points += input.pointsLoss;
    }
  }
  return [...map.values()].sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points;
    const setDiff = right.setsWon - right.setsLost - (left.setsWon - left.setsLost);
    if (setDiff !== 0) return setDiff;
    return right.gamesWon - right.gamesLost - (left.gamesWon - left.gamesLost);
  });
}

export function qualifierEntries(rows: StandingRow[], perGroup: number): DrawEntry[] {
  const groups = new Map<string, StandingRow[]>();
  for (const row of rows) {
    const list = groups.get(row.groupKey) ?? [];
    list.push(row);
    groups.set(row.groupKey, list);
  }
  const keys = [...groups.keys()].sort();
  const entries: DrawEntry[] = [];
  for (let place = 0; place < perGroup; place += 1) {
    for (const key of keys) {
      const row = groups.get(key)?.[place];
      if (row) entries.push({ id: row.userId, partnerId: row.partnerId });
    }
  }
  return entries;
}
