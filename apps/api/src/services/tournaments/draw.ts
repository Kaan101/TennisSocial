export type DrawEntry = { id: string; partnerId: string | null };

export type PlannedMatch = {
  stage: "GROUP" | "KNOCKOUT" | "AMERICANO";
  groupKey: string;
  round: number;
  position: number;
  playerAId: string | null;
  playerAPartnerId: string | null;
  playerBId: string | null;
  playerBPartnerId: string | null;
  winnerId: string | null;
};

export function nextPow2(value: number): number {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

export function bracketSeedOrder(size: number): number[] {
  let slots = [0];
  while (slots.length < size) {
    const next: number[] = [];
    const sum = slots.length * 2 - 1;
    for (const slot of slots) next.push(slot, sum - slot);
    slots = next;
  }
  return slots;
}

function blank(stage: PlannedMatch["stage"], groupKey: string, round: number, position: number): PlannedMatch {
  return {
    stage,
    groupKey,
    round,
    position,
    playerAId: null,
    playerAPartnerId: null,
    playerBId: null,
    playerBPartnerId: null,
    winnerId: null,
  };
}

function placeWinner(matches: PlannedMatch[], match: PlannedMatch, id: string, partnerId: string | null): void {
  const next = matches.find(
    (item) =>
      item.stage === match.stage &&
      item.groupKey === match.groupKey &&
      item.round === match.round + 1 &&
      item.position === Math.floor(match.position / 2),
  );
  if (!next) return;
  if (match.position % 2 === 0) {
    next.playerAId = id;
    next.playerAPartnerId = partnerId;
  } else {
    next.playerBId = id;
    next.playerBPartnerId = partnerId;
  }
}

export function propagateByes(matches: PlannedMatch[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of matches) {
      if (match.stage !== "KNOCKOUT" || match.winnerId) continue;
      if (match.playerAId && !match.playerBId) {
        match.winnerId = match.playerAId;
        placeWinner(matches, match, match.playerAId, match.playerAPartnerId);
        changed = true;
      } else if (match.playerBId && !match.playerAId) {
        match.winnerId = match.playerBId;
        placeWinner(matches, match, match.playerBId, match.playerBPartnerId);
        changed = true;
      }
    }
  }
}

export function planKnockout(entries: DrawEntry[]): PlannedMatch[] {
  if (entries.length < 2) return [];
  const size = nextPow2(entries.length);
  const order = bracketSeedOrder(size);
  const rounds = Math.log2(size);
  const matches: PlannedMatch[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    const count = size / 2 ** round;
    for (let position = 0; position < count; position += 1) {
      matches.push(blank("KNOCKOUT", "", round, position));
    }
  }
  const roundOne = matches.filter((match) => match.round === 1);
  for (let position = 0; position < roundOne.length; position += 1) {
    const left = order[position * 2] ?? -1;
    const right = order[position * 2 + 1] ?? -1;
    const a = left >= 0 && left < entries.length ? entries[left] : null;
    const b = right >= 0 && right < entries.length ? entries[right] : null;
    const match = roundOne[position];
    if (!match) continue;
    if (a) {
      match.playerAId = a.id;
      match.playerAPartnerId = a.partnerId;
    }
    if (b) {
      match.playerBId = b.id;
      match.playerBPartnerId = b.partnerId;
    }
  }
  propagateByes(matches);
  return matches;
}

export function planRoundRobin(entries: DrawEntry[], stage: PlannedMatch["stage"], groupKey: string): PlannedMatch[] {
  const list: (DrawEntry | null)[] = [...entries];
  if (list.length % 2 === 1) list.push(null);
  const count = list.length;
  const half = count / 2;
  const rotation = [...list];
  const matches: PlannedMatch[] = [];
  for (let round = 1; round <= count - 1; round += 1) {
    let position = 0;
    for (let index = 0; index < half; index += 1) {
      const a = rotation[index];
      const b = rotation[count - 1 - index];
      if (a && b) {
        const match = blank(stage, groupKey, round, position);
        match.playerAId = a.id;
        match.playerAPartnerId = a.partnerId;
        match.playerBId = b.id;
        match.playerBPartnerId = b.partnerId;
        matches.push(match);
        position += 1;
      }
    }
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    const last = rest.pop() ?? null;
    rotation.splice(0, rotation.length, fixed ?? null, last, ...rest);
  }
  return matches;
}

export function planAmericano(ids: string[]): PlannedMatch[] {
  if (ids.length < 4) throw new Error("Americano için en az 4 oyuncu gerekli");
  const fixed = ids[0]!;
  let rest = ids.slice(1);
  const matches: PlannedMatch[] = [];
  for (let round = 0; round < ids.length - 1; round += 1) {
    const order = [fixed, ...rest];
    let position = 0;
    for (let index = 0; index + 3 < order.length; index += 4) {
      const match = blank("AMERICANO", "", round + 1, position);
      match.playerAId = order[index] ?? null;
      match.playerAPartnerId = order[index + 1] ?? null;
      match.playerBId = order[index + 2] ?? null;
      match.playerBPartnerId = order[index + 3] ?? null;
      matches.push(match);
      position += 1;
    }
    const last = rest[rest.length - 1];
    rest = last ? [last, ...rest.slice(0, -1)] : rest;
  }
  return matches;
}

export function toEntries(
  players: { userId: string }[],
  division: "SINGLES" | "DOUBLES" | "MIXED",
  format: "SINGLE_ELIMINATION" | "ROUND_ROBIN" | "GROUPS_AND_KNOCKOUT" | "AMERICANO",
): DrawEntry[] {
  if (format === "AMERICANO" || division === "SINGLES") {
    return players.map((player) => ({ id: player.userId, partnerId: null }));
  }
  if (players.length % 2 !== 0) throw new Error("Çiftler için çift sayıda oyuncu gerekli");
  const entries: DrawEntry[] = [];
  for (let index = 0; index < players.length; index += 2) {
    entries.push({ id: players[index]!.userId, partnerId: players[index + 1]!.userId });
  }
  return entries;
}

export function planGroupStage(entries: DrawEntry[], groupSize: number): PlannedMatch[] {
  const groups = Math.max(1, Math.ceil(entries.length / Math.max(2, groupSize)));
  const buckets: DrawEntry[][] = Array.from({ length: groups }, () => []);
  entries.forEach((entry, index) => {
    buckets[index % groups]?.push(entry);
  });
  return buckets.flatMap((bucket, index) => planRoundRobin(bucket, "GROUP", String.fromCharCode(65 + index)));
}

export function planDraw(input: {
  format: "SINGLE_ELIMINATION" | "ROUND_ROBIN" | "GROUPS_AND_KNOCKOUT" | "AMERICANO";
  division: "SINGLES" | "DOUBLES" | "MIXED";
  players: { userId: string }[];
  groupSize?: number;
}): PlannedMatch[] {
  if (input.format === "AMERICANO") return planAmericano(input.players.map((player) => player.userId));
  const entries = toEntries(input.players, input.division, input.format);
  if (entries.length < 2) throw new Error("Eşleşme için en az 2 oyuncu gerekli");
  if (input.format === "SINGLE_ELIMINATION") return planKnockout(entries);
  if (input.format === "ROUND_ROBIN") return planRoundRobin(entries, "GROUP", "");
  return planGroupStage(entries, input.groupSize ?? 4);
}

export function roundLabel(round: number, maxRound: number, stage: PlannedMatch["stage"]): string {
  if (stage === "GROUP") return maxRound <= 1 ? "Grup" : `Grup turu ${round}`;
  if (stage === "AMERICANO") return `${round}. tur`;
  const fromEnd = maxRound - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Yarı final";
  if (fromEnd === 2) return "Çeyrek final";
  return `${round}. tur`;
}
