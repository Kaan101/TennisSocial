import type { FastifyInstance } from "fastify";
import {
  availabilityCellSchema,
  availabilityPutSchema,
  paginationSchema,
  privacySchema,
  profileUpdateSchema,
  racketSchema,
  roleChangeSchema,
  tennisProfileSchema,
} from "@club/shared";
import { writeAudit } from "../lib/audit";
import { assertRole, assertSelfOrRole, requireUser } from "../lib/authz";
import { dateOnly, parseDateOnly } from "../lib/dates";
import { AppError, forbidden, notFound, parse } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { imageStorage } from "../lib/storage";
import { availabilityWeek, paintAvailabilityCell } from "../services/availability-calendar";
import { areFriends } from "../services/friends";
import { toUserDetail, userInclude } from "../services/present";

async function loadUser(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: userInclude,
  });
  if (!user || !user.profile) throw notFound("Üye bulunamadı");
  return user;
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/users", async (req) => {
    const viewer = requireUser(req);
    assertRole(viewer, ["CLUB_MANAGER"]);
    const query = parse(paginationSchema, req.query);
    const where = { deletedAt: null };
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: { profile: true },
        orderBy: [{ profile: { lastName: "asc" } }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        firstName: row.profile?.firstName ?? "",
        lastName: row.profile?.lastName ?? "",
        playerStatus: row.profile?.playerStatus ?? null,
        district: row.profile?.district ?? null,
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  });

  app.get("/api/users/:id", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const user = await loadUser(id);
    const friend = await areFriends(viewer.id, user.id);
    const { detail, overrideFields } = await toUserDetail(user, viewer, friend);
    if (overrideFields.length && viewer.id !== user.id) {
      await writeAudit({
        actorId: viewer.id,
        action: "PRIVACY_OVERRIDE_READ",
        entityType: "User",
        entityId: user.id,
        metadata: { fields: overrideFields },
      });
    }
    return detail;
  });

  app.patch("/api/users/:id", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    assertSelfOrRole(viewer, id, ["CLUB_MANAGER"]);
    const body = parse(profileUpdateSchema, req.body);
    await loadUser(id);
    await prisma.profile.update({
      where: { userId: id },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        birthYear: body.birthYear,
        gender: body.gender,
        phone: body.phone,
        whatsapp: body.whatsapp,
        address: body.address,
        district: body.district,
        city: body.city,
        bio: body.bio,
        playerStatus: body.playerStatus,
        statusNote: body.statusNote,
        statusStart: body.statusStart === undefined ? undefined : body.statusStart ? parseDateOnly(body.statusStart) : null,
        statusEnd: body.statusEnd === undefined ? undefined : body.statusEnd ? parseDateOnly(body.statusEnd) : null,
        clubJoinDate: body.clubJoinDate ? parseDateOnly(body.clubJoinDate) : undefined,
      },
    });
    if (viewer.id !== id) {
      await writeAudit({
        actorId: viewer.id,
        action: "MEMBER_UPDATE",
        entityType: "User",
        entityId: id,
        metadata: { fields: Object.keys(body) },
      });
    }
    const user = await loadUser(id);
    const friend = await areFriends(viewer.id, user.id);
    const { detail } = await toUserDetail(user, viewer, friend);
    return detail;
  });

  app.patch("/api/users/:id/role", async (req) => {
    const viewer = requireUser(req);
    if (viewer.role !== "ADMIN") throw forbidden("Rol değişikliği yalnızca yöneticiye açık");
    const { id } = req.params as { id: string };
    const body = parse(roleChangeSchema, req.body);
    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw notFound("Üye bulunamadı");
    if (user.id === viewer.id && body.role !== "ADMIN") {
      throw new AppError(400, "VALIDATION_ERROR", "Kendi yönetici rolünü kaldıramazsın");
    }
    await prisma.user.update({ where: { id }, data: { role: body.role } });
    await writeAudit({
      actorId: viewer.id,
      action: "ROLE_CHANGE",
      entityType: "User",
      entityId: id,
      metadata: { from: user.role, to: body.role },
    });
    return { id, role: body.role };
  });

  app.delete("/api/users/:id", async (req) => {
    const viewer = requireUser(req);
    if (viewer.role !== "ADMIN") throw forbidden();
    const { id } = req.params as { id: string };
    if (id === viewer.id) throw new AppError(400, "VALIDATION_ERROR", "Kendi hesabını silemezsin");
    const user = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw notFound("Üye bulunamadı");
    await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit({ actorId: viewer.id, action: "USER_SOFT_DELETE", entityType: "User", entityId: id });
    return { ok: true };
  });

  app.get("/api/users/:id/tennis-profile", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const user = await loadUser(id);
    const friend = await areFriends(viewer.id, id);
    const { detail } = await toUserDetail(user, viewer, friend);
    if (!detail.permissions.canViewTennis) throw forbidden("Tenis profili gizli");
    const tennis = user.tennisProfile;
    if (!tennis) throw notFound("Tenis profili yok");
    return {
      tennisStartYear: tennis.tennisStartYear,
      dominantHand: tennis.dominantHand,
      backhandType: tennis.backhandType,
      preferredCourt: tennis.preferredCourt,
      playPreference: tennis.playPreference,
      preferredPlayTimes: tennis.preferredPlayTimes,
      overallLevel: tennis.overallLevel,
      ntrp: tennis.ntrp === null ? null : Number(tennis.ntrp),
      skills: tennis.skills.map((skill) => ({ skill: skill.skill, value: Number(skill.value) })),
    };
  });

  app.put("/api/users/:id/tennis-profile", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    assertSelfOrRole(viewer, id, ["CLUB_MANAGER"]);
    const body = parse(tennisProfileSchema, req.body);
    await loadUser(id);
    await prisma.$transaction(async (tx) => {
      const tennis = await tx.tennisProfile.upsert({
        where: { userId: id },
        create: { userId: id },
        update: {},
      });
      await tx.tennisProfile.update({
        where: { id: tennis.id },
        data: {
          tennisStartYear: body.tennisStartYear,
          dominantHand: body.dominantHand,
          backhandType: body.backhandType,
          preferredCourt: body.preferredCourt,
          playPreference: body.playPreference,
          preferredPlayTimes: body.preferredPlayTimes,
          overallLevel: body.overallLevel,
          ntrp: body.ntrp,
        },
      });
      if (body.skills) {
        await tx.skillRating.deleteMany({ where: { tennisProfileId: tennis.id } });
        if (body.skills.length) {
          await tx.skillRating.createMany({
            data: body.skills.map((skill) => ({
              tennisProfileId: tennis.id,
              skill: skill.skill,
              value: skill.value,
            })),
          });
        }
      }
    });
    const user = await loadUser(id);
    return {
      overallLevel: user.tennisProfile?.overallLevel,
      skills: user.tennisProfile?.skills.map((skill) => ({ skill: skill.skill, value: Number(skill.value) })) ?? [],
    };
  });

  app.get("/api/users/:id/rackets", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const user = await loadUser(id);
    const friend = await areFriends(viewer.id, id);
    const { detail } = await toUserDetail(user, viewer, friend);
    if (!detail.permissions.canViewTennis) throw forbidden("Raket bilgisi gizli");
    return { data: detail.rackets };
  });

  app.post("/api/users/:id/rackets", async (req, reply) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    assertSelfOrRole(viewer, id, ["CLUB_MANAGER"]);
    const body = parse(racketSchema, req.body);
    await loadUser(id);
    if (body.isPrimary) {
      await prisma.racket.updateMany({ where: { userId: id, deletedAt: null }, data: { isPrimary: false } });
    }
    const racket = await prisma.racket.create({
      data: {
        userId: id,
        brand: body.brand,
        model: body.model,
        headSize: body.headSize ?? null,
        weight: body.weight ?? null,
        stringName: body.stringName ?? null,
        tension: body.tension ?? null,
        gripSize: body.gripSize ?? null,
        isPrimary: body.isPrimary ?? false,
      },
    });
    return reply.status(201).send(racket);
  });

  app.delete("/api/users/:id/rackets/:racketId", async (req) => {
    const viewer = requireUser(req);
    const { id, racketId } = req.params as { id: string; racketId: string };
    assertSelfOrRole(viewer, id, ["CLUB_MANAGER"]);
    const racket = await prisma.racket.findFirst({ where: { id: racketId, userId: id, deletedAt: null } });
    if (!racket) throw notFound("Raket bulunamadı");
    await prisma.racket.update({ where: { id: racketId }, data: { deletedAt: new Date(), isPrimary: false } });
    return { ok: true };
  });

  app.get("/api/users/:id/availability", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const user = await loadUser(id);
    const friend = await areFriends(viewer.id, id);
    const { detail } = await toUserDetail(user, viewer, friend);
    if (!detail.permissions.canViewAvailability) throw forbidden("Müsaitlik gizli");
    return {
      weekly: user.availability
        .filter((item) => item.kind === "WEEKLY")
        .map((item) => ({ weekday: item.weekday, startTime: item.startTime, endTime: item.endTime, note: item.note })),
      oneOff: user.availability
        .filter((item) => item.kind === "ONE_OFF")
        .map((item) => ({ date: dateOnly(item.date), startTime: item.startTime, endTime: item.endTime, note: item.note })),
    };
  });

  app.put("/api/users/:id/availability", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    assertSelfOrRole(viewer, id, ["CLUB_MANAGER"]);
    const body = parse(availabilityPutSchema, req.body);
    for (const window of [...body.weekly, ...body.oneOff]) {
      if (window.endTime <= window.startTime) {
        throw new AppError(400, "VALIDATION_ERROR", "Bitiş saati başlangıçtan sonra olmalı");
      }
    }
    await loadUser(id);
    await prisma.$transaction(async (tx) => {
      await tx.availability.updateMany({ where: { userId: id, deletedAt: null }, data: { deletedAt: new Date() } });
      if (body.weekly.length || body.oneOff.length) {
        await tx.availability.createMany({
          data: [
            ...body.weekly.map((window) => ({
              userId: id,
              kind: "WEEKLY" as const,
              weekday: window.weekday,
              startTime: window.startTime,
              endTime: window.endTime,
              note: window.note ?? null,
            })),
            ...body.oneOff.map((window) => ({
              userId: id,
              kind: "ONE_OFF" as const,
              date: parseDateOnly(window.date),
              startTime: window.startTime,
              endTime: window.endTime,
              note: window.note ?? null,
            })),
          ],
        });
      }
    });
    return { ok: true };
  });

  app.get("/api/me/availability-week", async (req) => {
    const viewer = requireUser(req);
    const week = (req.query as { week?: string }).week;
    return availabilityWeek(viewer.id, week);
  });

  app.post("/api/me/availability-cells", async (req) => {
    const viewer = requireUser(req);
    const body = parse(availabilityCellSchema, req.body);
    return paintAvailabilityCell(viewer.id, body);
  });

  app.get("/api/users/:id/privacy", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    assertSelfOrRole(viewer, id, ["CLUB_MANAGER"]);
    const privacy = await prisma.privacySetting.findUnique({ where: { userId: id } });
    if (!privacy) throw notFound();
    return privacy;
  });

  app.put("/api/users/:id/privacy", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    if (viewer.id !== id && viewer.role !== "ADMIN") throw forbidden("Gizlilik ayarını yalnızca sahibi değiştirebilir");
    const body = parse(privacySchema, req.body);
    const privacy = await prisma.privacySetting.upsert({
      where: { userId: id },
      create: { userId: id, ...body },
      update: body,
    });
    return privacy;
  });

  app.post("/api/users/:id/photo", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    assertSelfOrRole(viewer, id, ["CLUB_MANAGER"]);
    const file = await req.file();
    if (!file) throw new AppError(400, "VALIDATION_ERROR", "Fotoğraf seç");
    const data = await file.toBuffer();
    let stored;
    try {
      stored = await imageStorage.upload({ data, filename: file.filename, mimeType: file.mimetype });
    } catch (error) {
      throw new AppError(400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Yükleme başarısız");
    }
    const profile = await prisma.profile.findUnique({ where: { userId: id } });
    if (profile?.photoPublicId) await imageStorage.delete(profile.photoPublicId).catch(() => undefined);
    await prisma.profile.update({
      where: { userId: id },
      data: { photoUrl: stored.url, photoPublicId: stored.publicId },
    });
    return { photoUrl: stored.url };
  });
}
