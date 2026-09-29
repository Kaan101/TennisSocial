import type { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";

export async function notify(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  await prisma.notification.create({ data: input });
}

export async function notifyMany(
  userIds: string[],
  input: { type: NotificationType; title: string; body: string; link?: string },
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return;
  await prisma.notification.createMany({
    data: unique.map((userId) => ({ userId, ...input })),
  });
}
