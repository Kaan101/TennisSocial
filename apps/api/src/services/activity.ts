import type { ActivityType } from "@prisma/client";
import { canViewField } from "../lib/privacy";
import { prisma } from "../lib/prisma";
import type { AuthUser } from "../lib/authz";
import { loadFriendIds } from "./friends";

export async function recordActivity(input: {
  actorId: string;
  type: ActivityType;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  await prisma.activityEvent.create({ data: input });
}

export async function listActivity(viewer: AuthUser, limit = 30) {
  const rows = await prisma.activityEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 120,
    include: { actor: { include: { profile: true, privacy: true } } },
  });
  const friends = await loadFriendIds(viewer.id);
  const data = [];
  for (const row of rows) {
    const level = row.actor.privacy?.activityVisibility ?? "MEMBERS";
    const decision = canViewField(level, viewer, row.actorId, friends.has(row.actorId));
    if (!decision.allowed) continue;
    data.push({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      link: row.link,
      createdAt: row.createdAt.toISOString(),
      actorId: row.actorId,
      actorName: `${row.actor.profile?.firstName ?? ""} ${row.actor.profile?.lastName ?? ""}`.trim(),
    });
    if (data.length >= limit) break;
  }
  return data;
}
