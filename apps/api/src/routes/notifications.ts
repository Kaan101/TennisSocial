import type { FastifyInstance } from "fastify";
import { paginationSchema } from "@club/shared";
import { requireUser } from "../lib/authz";
import { notFound, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/notifications", async (req) => {
    const viewer = requireUser(req);
    const query = parse(paginationSchema, req.query);
    const where = { userId: viewer.id };
    const [total, unread, rows] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        link: row.link,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        unread,
      },
    };
  });

  app.post("/api/notifications/:id/read", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const row = await prisma.notification.findFirst({ where: { id, userId: viewer.id } });
    if (!row) throw notFound("Bildirim bulunamadı");
    const updated = await prisma.notification.update({ where: { id }, data: { readAt: row.readAt ?? new Date() } });
    return { id: updated.id, readAt: updated.readAt?.toISOString() ?? null };
  });

  app.post("/api/notifications/read-all", async (req) => {
    const viewer = requireUser(req);
    await prisma.notification.updateMany({
      where: { userId: viewer.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });
}
