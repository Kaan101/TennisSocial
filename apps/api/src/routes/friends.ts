import type { FastifyInstance } from "fastify";
import { friendRequestSchema } from "@club/shared";
import { requireUser } from "../lib/authz";
import { AppError, forbidden, notFound, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";

export async function friendRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/friends", async (req) => {
    const viewer = requireUser(req);
    const rows = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: viewer.id }, { addresseeId: viewer.id }],
      },
      include: {
        requester: { include: { profile: true } },
        addressee: { include: { profile: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return {
      data: rows.map((row) => {
        const other = row.requesterId === viewer.id ? row.addressee : row.requester;
        return {
          id: row.id,
          status: row.status,
          userId: other.id,
          name: `${other.profile?.firstName ?? ""} ${other.profile?.lastName ?? ""}`.trim(),
          direction: row.requesterId === viewer.id ? "outgoing" : "incoming",
        };
      }),
    };
  });

  app.post("/api/friends", async (req, reply) => {
    const viewer = requireUser(req);
    const body = parse(friendRequestSchema, req.body);
    if (body.userId === viewer.id) throw new AppError(400, "VALIDATION_ERROR", "Kendini ekleyemezsin");
    const other = await prisma.user.findFirst({ where: { id: body.userId, deletedAt: null } });
    if (!other) throw notFound("Üye bulunamadı");
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: viewer.id, addresseeId: body.userId },
          { requesterId: body.userId, addresseeId: viewer.id },
        ],
      },
    });
    if (existing?.status === "ACCEPTED") return existing;
    if (existing?.status === "PENDING") return existing;
    const created = await prisma.friendship.create({
      data: { requesterId: viewer.id, addresseeId: body.userId, status: "PENDING" },
    });
    return reply.status(201).send(created);
  });

  app.post("/api/friends/:id/accept", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const row = await prisma.friendship.findUnique({ where: { id } });
    if (!row) throw notFound();
    if (row.addresseeId !== viewer.id) throw forbidden();
    return prisma.friendship.update({ where: { id }, data: { status: "ACCEPTED" } });
  });

  app.delete("/api/friends/:id", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const row = await prisma.friendship.findUnique({ where: { id } });
    if (!row) throw notFound();
    if (row.requesterId !== viewer.id && row.addresseeId !== viewer.id) throw forbidden();
    await prisma.friendship.delete({ where: { id } });
    return { ok: true };
  });
}
