import type { FastifyInstance } from "fastify";
import { paginationSchema } from "@club/shared";
import { requireUser } from "../lib/authz";
import { forbidden, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/audit-logs", async (req) => {
    const viewer = requireUser(req);
    if (viewer.role !== "ADMIN") throw forbidden();
    const query = parse(paginationSchema, req.query);
    const [total, rows] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { actor: { include: { profile: true } } },
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
        actorName: row.actor ? `${row.actor.profile?.firstName ?? ""} ${row.actor.profile?.lastName ?? ""}`.trim() : null,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  });
}
