import type { FastifyInstance } from "fastify";
import { groupCreateSchema, groupEventSchema, groupMemberSchema, paginationSchema } from "@club/shared";
import { z } from "zod";
import { writeAudit } from "../lib/audit";
import { assertCanManageGroup, assertRole, requireUser } from "../lib/authz";
import { forbidden, notFound, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { notify } from "../services/notify";

async function visibleGroupWhere(userId: string, role: string) {
  if (role === "ADMIN" || role === "CLUB_MANAGER") return { deletedAt: null };
  return {
    deletedAt: null,
    OR: [{ visibility: "PUBLIC" as const }, { members: { some: { userId } } }],
  };
}

export async function groupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/groups", async (req) => {
    const viewer = requireUser(req);
    const query = parse(paginationSchema, req.query);
    const where = await visibleGroupWhere(viewer.id, viewer.role);
    const [total, rows] = await Promise.all([
      prisma.group.count({ where }),
      prisma.group.findMany({
        where,
        include: {
          members: { include: { user: { include: { profile: true } } } },
        },
        orderBy: { name: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        imageUrl: group.imageUrl,
        visibility: group.visibility,
        memberCount: group.members.length,
        joined: group.members.some((member) => member.userId === viewer.id),
        managed: group.members.some((member) => member.userId === viewer.id && member.role === "MANAGER"),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  });

  app.post("/api/groups", async (req, reply) => {
    const viewer = requireUser(req);
    assertRole(viewer, ["CLUB_MANAGER", "GROUP_MANAGER"]);
    const body = parse(groupCreateSchema, req.body);
    const group = await prisma.group.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        visibility: body.visibility,
        createdById: viewer.id,
        members: { create: { userId: viewer.id, role: "MANAGER" } },
      },
    });
    return reply.status(201).send(group);
  });

  app.get("/api/groups/:id", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const group = await prisma.group.findFirst({
      where: { id, deletedAt: null },
      include: {
        members: { include: { user: { include: { profile: true } } } },
        events: { where: { deletedAt: null }, orderBy: { startsAt: "asc" }, take: 10 },
        matches: {
          where: { deletedAt: null },
          orderBy: { scheduledAt: "desc" },
          take: 8,
          include: { players: { include: { user: { include: { profile: true } } } } },
        },
        tournaments: { where: { deletedAt: null }, orderBy: { startDate: "asc" }, take: 8 },
      },
    });
    if (!group) throw notFound("Grup bulunamadı");
    const member = group.members.find((item) => item.userId === viewer.id);
    if (group.visibility === "PRIVATE" && !member && viewer.role !== "ADMIN" && viewer.role !== "CLUB_MANAGER") {
      throw forbidden("Bu grup gizli");
    }
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      imageUrl: group.imageUrl,
      visibility: group.visibility,
      joined: Boolean(member),
      managed: member?.role === "MANAGER" || viewer.role === "ADMIN" || viewer.role === "CLUB_MANAGER",
      members: group.members.map((item) => ({
        userId: item.userId,
        role: item.role,
        name: `${item.user.profile?.firstName ?? ""} ${item.user.profile?.lastName ?? ""}`.trim(),
        photoUrl: item.user.profile?.photoUrl ?? null,
      })),
      events: group.events.map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        startsAt: event.startsAt.toISOString(),
        location: event.location,
      })),
      matches: group.matches.map((match) => ({
        id: match.id,
        scheduledAt: match.scheduledAt.toISOString(),
        status: match.status,
        score: match.score,
        players: match.players.map((player) => ({
          name: `${player.user.profile?.firstName ?? ""} ${player.user.profile?.lastName ?? ""}`.trim(),
          side: player.side,
        })),
      })),
      tournaments: group.tournaments.map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        startDate: tournament.startDate.toISOString().slice(0, 10),
      })),
    };
  });

  app.patch("/api/groups/:id", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    await assertCanManageGroup(viewer, id);
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(80).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        imageUrl: z.string().trim().url().max(400).nullable().optional(),
        visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
      }),
      req.body,
    );
    const group = await prisma.group.findFirst({ where: { id, deletedAt: null } });
    if (!group) throw notFound("Grup bulunamadı");
    return prisma.group.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        imageUrl: body.imageUrl,
        visibility: body.visibility,
      },
    });
  });

  app.delete("/api/groups/:id", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    await assertCanManageGroup(viewer, id);
    const group = await prisma.group.findFirst({ where: { id, deletedAt: null } });
    if (!group) throw notFound("Grup bulunamadı");
    await prisma.group.update({ where: { id }, data: { deletedAt: new Date() } });
    await writeAudit({ actorId: viewer.id, action: "GROUP_SOFT_DELETE", entityType: "Group", entityId: id });
    return { ok: true };
  });

  app.post("/api/groups/:id/join", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const group = await prisma.group.findFirst({ where: { id, deletedAt: null } });
    if (!group) throw notFound("Grup bulunamadı");
    if (group.visibility !== "PUBLIC") throw forbidden("Kapalı gruba davet gerekir");
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: id, userId: viewer.id } },
      create: { groupId: id, userId: viewer.id, role: "MEMBER" },
      update: {},
    });
    return { ok: true };
  });

  app.post("/api/groups/:id/members", async (req, reply) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    await assertCanManageGroup(viewer, id);
    const body = parse(groupMemberSchema, req.body);
    const user = await prisma.user.findFirst({ where: { id: body.userId, deletedAt: null } });
    if (!user) throw notFound("Üye bulunamadı");
    const member = await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: id, userId: body.userId } },
      create: { groupId: id, userId: body.userId, role: body.role },
      update: { role: body.role },
    });
    await notify({
      userId: body.userId,
      type: "GROUP_INVITE",
      title: "Gruba eklendin",
      body: "Bir kulüp grubuna dahil edildin.",
      link: `/gruplar/${id}`,
    });
    return reply.status(201).send(member);
  });

  app.delete("/api/groups/:id/members/:userId", async (req) => {
    const viewer = requireUser(req);
    const { id, userId } = req.params as { id: string; userId: string };
    if (viewer.id !== userId) await assertCanManageGroup(viewer, id);
    await prisma.groupMember.deleteMany({ where: { groupId: id, userId } });
    return { ok: true };
  });

  app.post("/api/groups/:id/events", async (req, reply) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    await assertCanManageGroup(viewer, id);
    const body = parse(groupEventSchema, req.body);
    const event = await prisma.groupEvent.create({
      data: {
        groupId: id,
        title: body.title,
        description: body.description ?? null,
        startsAt: new Date(body.startsAt),
        location: body.location ?? null,
        createdById: viewer.id,
      },
    });
    return reply.status(201).send(event);
  });
}
