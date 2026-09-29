import type { PlayerCard, Suggestion } from "@club/types";
import type { SkillName } from "@club/shared";
import { prisma } from "../../lib/prisma";
import { scoreOpponent, type ScoreProfile } from "./score";
import { toPlayerCard, userInclude, type UserWithRelations } from "../present";
import { loadFriendIds } from "../friends";

export interface Matchmaker {
  suggest(userId: string, limit?: number): Promise<Suggestion[]>;
}

async function pastCounts(userId: string, otherIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.match.findMany({
    where: {
      deletedAt: null,
      status: "COMPLETED",
      players: { some: { userId } },
    },
    select: { players: { select: { userId: true } } },
  });
  const counts = new Map<string, number>();
  for (const id of otherIds) counts.set(id, 0);
  for (const match of rows) {
    for (const player of match.players) {
      if (player.userId !== userId && counts.has(player.userId)) {
        counts.set(player.userId, (counts.get(player.userId) ?? 0) + 1);
      }
    }
  }
  return counts;
}

function toScoreProfile(user: UserWithRelations, pastMatchCount: number): ScoreProfile | null {
  if (!user.tennisProfile || !user.profile) return null;
  const skills: Partial<Record<SkillName, number>> = {};
  for (const skill of user.tennisProfile.skills) {
    skills[skill.skill] = Number(skill.value);
  }
  return {
    userId: user.id,
    overallLevel: user.tennisProfile.overallLevel,
    skills,
    weekly: user.availability
      .filter((item) => item.kind === "WEEKLY" && item.weekday !== null)
      .map((item) => ({ weekday: item.weekday as number, startTime: item.startTime, endTime: item.endTime })),
    district: user.profile.district,
    playPreference: user.tennisProfile.playPreference,
    preferredPlayTimes: user.tennisProfile.preferredPlayTimes,
    pastMatchCount,
  };
}

export class RuleBasedMatchmaker implements Matchmaker {
  async suggest(userId: string, limit = 8): Promise<Suggestion[]> {
    const viewer = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: userInclude,
    });
    if (!viewer) return [];
    const candidates = await prisma.user.findMany({
      where: {
        deletedAt: null,
        id: { not: userId },
        profile: { is: { deletedAt: null, playerStatus: { in: ["ACTIVE", "LIMITED"] } } },
      },
      include: userInclude,
    });
    const counts = await pastCounts(
      userId,
      candidates.map((candidate) => candidate.id),
    );
    const viewerProfile = toScoreProfile(viewer, 0);
    if (!viewerProfile) return [];
    const friendIds = await loadFriendIds(userId);
    const viewerAuth = { id: viewer.id, role: viewer.role, email: viewer.email };
    const ranked = candidates
      .map((candidate) => {
        const past = counts.get(candidate.id) ?? 0;
        const profile = toScoreProfile(candidate, past);
        if (!profile) return null;
        const scored = scoreOpponent({ ...viewerProfile, pastMatchCount: past }, profile);
        const card: PlayerCard = toPlayerCard(candidate, viewerAuth, friendIds.has(candidate.id));
        return { user: card, score: scored.score, reasons: scored.reasons };
      })
      .filter((item): item is Suggestion => item !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return ranked;
  }
}

export const matchmaker: Matchmaker = new RuleBasedMatchmaker();
