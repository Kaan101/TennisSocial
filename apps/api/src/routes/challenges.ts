import type { FastifyInstance } from "fastify";
import { SET_FORMAT_LABELS, challengeCounterSchema, challengeCreateSchema, paginationSchema } from "@club/shared";
import { z } from "zod";
import type { ChallengeStatus } from "@prisma/client";
import { combineIstanbul, dateOnly } from "../lib/dates";
import { AppError, forbidden, notFound, parse } from "../lib/errors";
import { requireUser } from "../lib/authz";
import { prisma } from "../lib/prisma";
import { assertLadderChallenge } from "../services/ladders";
import { notify } from "../services/notify";

const challengeInclude = {
  challenger: { include: { profile: true } },
  recipient: { include: { profile: true } },
} as const;

function nameOf(user: { profile: { firstName: string; lastName: string } | null }): string {
  return `${user.profile?.firstName ?? ""} ${user.profile?.lastName ?? ""}`.trim();
}

function present(challenge: {
  id: string;
  format: "SINGLE" | "DOUBLE";
  status: ChallengeStatus;
  proposedDate: Date;
  proposedTime: string;
  counterDate: Date | null;
  counterTime: string | null;
  counterNote: string | null;
  court: string | null;
  setFormat: "BEST_OF_3" | "BEST_OF_3_SUPER_TIEBREAK" | "PRO_SET" | "ONE_SET";
  note: string | null;
  awaitingUserId: string | null;
  matchId: string | null;
  challengerId: string;
  recipientId: string;
  challenger: { profile: { firstName: string; lastName: string } | null };
  recipient: { profile: { firstName: string; lastName: string } | null };
}, viewerId: string) {
  const open = challenge.status === "PENDING" || challenge.status === "COUNTERED";
  return {
    id: challenge.id,
    format: challenge.format,
    formatLabel: challenge.format === "SINGLE" ? "Tekler" : "Çiftler",
    status: challenge.status,
    proposedDate: dateOnly(challenge.proposedDate),
    proposedTime: challenge.proposedTime,
    counterDate: dateOnly(challenge.counterDate),
    counterTime: challenge.counterTime,
    counterNote: challenge.counterNote,
    court: challenge.court,
    setFormat: challenge.setFormat,
    setFormatLabel: SET_FORMAT_LABELS[challenge.setFormat],
    note: challenge.note,
    challenger: { id: challenge.challengerId, name: nameOf(challenge.challenger) },
    recipient: { id: challenge.recipientId, name: nameOf(challenge.recipient) },
    awaitingUserId: challenge.awaitingUserId,
    matchId: challenge.matchId,
    canRespond: open && challenge.awaitingUserId === viewerId,
    canCancel: open && challenge.challengerId === viewerId,
  };
}

async function acceptChallenge(id: string, viewerId: string) {
  const challenge = await prisma.challenge.findFirst({ where: { id, deletedAt: null } });
  if (!challenge) throw notFound("Defi bulunamadı");
  if (challenge.awaitingUserId !== viewerId) throw forbidden("Bu defiye şu an sen yanıt verebilirsin");
  if (challenge.status !== "PENDING" && challenge.status !== "COUNTERED") {
    throw new AppError(409, "CONFLICT", "Bu defi artık yanıtlanamaz");
  }
  const date = challenge.status === "COUNTERED" && challenge.counterDate ? dateOnly(challenge.counterDate) : dateOnly(challenge.proposedDate);
  const time = challenge.status === "COUNTERED" && challenge.counterTime ? challenge.counterTime : challenge.proposedTime;
  if (!date || !time) throw new AppError(400, "VALIDATION_ERROR", "Tarih eksik");
  const players = [
    { userId: challenge.challengerId, side: "A" as const },
    ...(challenge.challengerPartnerId ? [{ userId: challenge.challengerPartnerId, side: "A" as const }] : []),
    { userId: challenge.recipientId, side: "B" as const },
    ...(challenge.recipientPartnerId ? [{ userId: challenge.recipientPartnerId, side: "B" as const }] : []),
  ];
  const match = await prisma.match.create({
    data: {
      format: challenge.format,
      scheduledAt: combineIstanbul(date, time),
      court: challenge.court,
      setFormat: challenge.setFormat,
      note: challenge.note,
      groupId: challenge.groupId,
      ladderId: challenge.ladderId,
      createdById: viewerId,
      status: "SCHEDULED",
      players: { create: players },
    },
  });
  const updated = await prisma.challenge.update({
    where: { id },
    data: { status: "ACCEPTED", matchId: match.id, awaitingUserId: null },
    include: challengeInclude,
  });
  const other = viewerId === challenge.challengerId ? challenge.recipientId : challenge.challengerId;
  await notify({
    userId: other,
    type: "CHALLENGE_ACCEPTED",
    title: "Defi kabul edildi",
    body: "Maç takvime eklendi.",
    link: `/maclar/${match.id}`,
  });
  await notify({
    userId: viewerId,
    type: "MATCH_SCHEDULED",
    title: "Maç planlandı",
    body: "Kabul edilen defi maça dönüştü.",
    link: `/maclar/${match.id}`,
  });
  return { challenge: present(updated, viewerId), matchId: match.id };
}

export async function challengeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/challenges", async (req) => {
    const viewer = requireUser(req);
    const query = parse(
      paginationSchema.extend({
        scope: z.enum(["all", "incoming", "outgoing"]).default("all"),
      }),
      req.query,
    );
    const scope = query.scope;
    const where =
      scope === "incoming"
        ? { deletedAt: null, recipientId: viewer.id }
        : scope === "outgoing"
          ? { deletedAt: null, challengerId: viewer.id }
          : viewer.role === "ADMIN" || viewer.role === "CLUB_MANAGER"
            ? { deletedAt: null }
            : {
                deletedAt: null,
                OR: [
                  { challengerId: viewer.id },
                  { recipientId: viewer.id },
                  { challengerPartnerId: viewer.id },
                  { recipientPartnerId: viewer.id },
                ],
              };
    const [total, rows] = await Promise.all([
      prisma.challenge.count({ where }),
      prisma.challenge.findMany({
        where,
        include: challengeInclude,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      data: rows.map((row) => present(row, viewer.id)),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
    };
  });

  app.post("/api/challenges", async (req, reply) => {
    const viewer = requireUser(req);
    const body = parse(challengeCreateSchema, req.body);
    if (body.recipientId === viewer.id) throw new AppError(400, "VALIDATION_ERROR", "Kendine defi gönderemezsin");
    if (body.format === "DOUBLE" && (!body.challengerPartnerId || !body.recipientPartnerId)) {
      throw new AppError(400, "VALIDATION_ERROR", "Çiftler defisinde iki partner de seçilmeli");
    }
    const ids = [body.recipientId, body.challengerPartnerId, body.recipientPartnerId].filter(Boolean) as string[];
    const found = await prisma.user.count({ where: { id: { in: ids }, deletedAt: null } });
    if (found !== new Set(ids).size) throw notFound("Oyuncu bulunamadı");
    if (body.ladderId) {
      await assertLadderChallenge({ ladderId: body.ladderId, challengerId: viewer.id, recipientId: body.recipientId });
    }
    const challenge = await prisma.challenge.create({
      data: {
        format: body.format,
        challengerId: viewer.id,
        recipientId: body.recipientId,
        challengerPartnerId: body.challengerPartnerId ?? null,
        recipientPartnerId: body.recipientPartnerId ?? null,
        proposedDate: new Date(`${body.proposedDate}T00:00:00.000Z`),
        proposedTime: body.proposedTime,
        court: body.court ?? null,
        setFormat: body.setFormat,
        note: body.note ?? null,
        groupId: body.groupId ?? null,
        ladderId: body.ladderId ?? null,
        status: "PENDING",
        awaitingUserId: body.recipientId,
      },
      include: challengeInclude,
    });
    await notify({
      userId: body.recipientId,
      type: "CHALLENGE_RECEIVED",
      title: "Yeni defi",
      body: `${nameOf(challenge.challenger)} sana maç teklif etti.`,
      link: `/defiler/${challenge.id}`,
    });
    return reply.status(201).send(present(challenge, viewer.id));
  });

  app.get("/api/challenges/:id", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const challenge = await prisma.challenge.findFirst({ where: { id, deletedAt: null }, include: challengeInclude });
    if (!challenge) throw notFound("Defi bulunamadı");
    const involved = [challenge.challengerId, challenge.recipientId, challenge.challengerPartnerId, challenge.recipientPartnerId];
    if (!involved.includes(viewer.id) && viewer.role !== "ADMIN" && viewer.role !== "CLUB_MANAGER") throw forbidden();
    return present(challenge, viewer.id);
  });

  app.post("/api/challenges/:id/accept", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    return acceptChallenge(id, viewer.id);
  });

  app.post("/api/challenges/:id/decline", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const challenge = await prisma.challenge.findFirst({ where: { id, deletedAt: null }, include: challengeInclude });
    if (!challenge) throw notFound("Defi bulunamadı");
    if (challenge.awaitingUserId !== viewer.id) throw forbidden();
    if (challenge.status !== "PENDING" && challenge.status !== "COUNTERED") throw new AppError(409, "CONFLICT", "Bu defi kapanmış");
    const updated = await prisma.challenge.update({
      where: { id },
      data: { status: "DECLINED", awaitingUserId: null },
      include: challengeInclude,
    });
    const other = viewer.id === challenge.challengerId ? challenge.recipientId : challenge.challengerId;
    await notify({
      userId: other,
      type: "CHALLENGE_DECLINED",
      title: "Defi reddedildi",
      body: "Teklif kabul edilmedi.",
      link: `/defiler/${id}`,
    });
    return present(updated, viewer.id);
  });

  app.post("/api/challenges/:id/counter", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(challengeCounterSchema, req.body);
    const challenge = await prisma.challenge.findFirst({ where: { id, deletedAt: null }, include: challengeInclude });
    if (!challenge) throw notFound("Defi bulunamadı");
    if (challenge.awaitingUserId !== viewer.id) throw forbidden();
    if (challenge.status !== "PENDING" && challenge.status !== "COUNTERED") throw new AppError(409, "CONFLICT", "Bu defi kapanmış");
    const other = viewer.id === challenge.challengerId ? challenge.recipientId : challenge.challengerId;
    const updated = await prisma.challenge.update({
      where: { id },
      data: {
        status: "COUNTERED",
        counterDate: new Date(`${body.proposedDate}T00:00:00.000Z`),
        counterTime: body.proposedTime,
        counterNote: body.note ?? null,
        counteredById: viewer.id,
        awaitingUserId: other,
      },
      include: challengeInclude,
    });
    await notify({
      userId: other,
      type: "CHALLENGE_COUNTERED",
      title: "Yeni saat önerildi",
      body: body.note || `${body.proposedDate} ${body.proposedTime} önerildi.`,
      link: `/defiler/${id}`,
    });
    return present(updated, viewer.id);
  });

  app.post("/api/challenges/:id/cancel", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const challenge = await prisma.challenge.findFirst({ where: { id, deletedAt: null }, include: challengeInclude });
    if (!challenge) throw notFound("Defi bulunamadı");
    if (challenge.challengerId !== viewer.id && viewer.role !== "ADMIN") throw forbidden();
    if (challenge.status === "ACCEPTED") throw new AppError(409, "CONFLICT", "Kabul edilmiş defi iptal edilemez");
    const updated = await prisma.challenge.update({
      where: { id },
      data: { status: "CANCELLED", awaitingUserId: null },
      include: challengeInclude,
    });
    return present(updated, viewer.id);
  });
}
