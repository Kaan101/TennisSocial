import type { FastifyInstance } from "fastify";
import { announcementSchema, paginationSchema } from "@club/shared";
import { writeAudit } from "../lib/audit";
import { assertRole, requireUser } from "../lib/authz";
import { notFound, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";

export async function announcementRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/announcements", async (req) => {
    requireUser(req);
    const query = parse(paginationSchema, req.query);
    const where = {
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
    const [total, rows] = await Promise.all([
      prisma.announcement.count({ where }),
      prisma.announcement.findMany({
        where,
        include: { author: { include: { profile: true } } },
        orderBy: { publishedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        publishedAt: row.publishedAt.toISOString(),
        authorName: `${row.author.profile?.firstName ?? ""} ${row.author.profile?.lastName ?? ""}`.trim(),
      })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  });

  app.post("/api/announcements", async (req, reply) => {
    const viewer = requireUser(req);
    assertRole(viewer, ["CLUB_MANAGER"]);
    const body = parse(announcementSchema, req.body);
    const created = await prisma.announcement.create({
      data: {
        title: body.title,
        body: body.body,
        authorId: viewer.id,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    await writeAudit({
      actorId: viewer.id,
      action: "ANNOUNCEMENT_CREATE",
      entityType: "Announcement",
      entityId: created.id,
      metadata: { title: created.title },
    });
    const members = await prisma.user.findMany({
      where: { deletedAt: null, id: { not: viewer.id } },
      select: { id: true },
    });
    await prisma.notification.createMany({
      data: members.map((member) => ({
        userId: member.id,
        type: "ANNOUNCEMENT" as const,
        title: body.title,
        body: body.body.slice(0, 180),
        link: "/duyurular",
      })),
    });
    return reply.status(201).send({ id: created.id, title: created.title, body: created.body });
  });

  app.patch("/api/announcements/:id", async (req) => {
    const viewer = requireUser(req);
    assertRole(viewer, ["CLUB_MANAGER"]);
    const { id } = req.params as { id: string };
    const body = parse(announcementSchema, req.body);
    const row = await prisma.announcement.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw notFound("Duyuru bulunamadı");
    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        title: body.title,
        body: body.body,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    await writeAudit({
      actorId: viewer.id,
      action: "ANNOUNCEMENT_UPDATE",
      entityType: "Announcement",
      entityId: id,
      metadata: { title: updated.title },
    });
    return { id: updated.id, title: updated.title, body: updated.body };
  });

  app.delete("/api/announcements/:id", async (req) => {
    const viewer = requireUser(req);
    assertRole(viewer, ["CLUB_MANAGER"]);
    const { id } = req.params as { id: string };
    const row = await prisma.announcement.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw notFound("Duyuru bulunamadı");
    await prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit({ actorId: viewer.id, action: "ANNOUNCEMENT_SOFT_DELETE", entityType: "Announcement", entityId: id });
    return { ok: true };
  });
}
