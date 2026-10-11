import { AppError, notFound } from "../lib/errors";
import { prisma } from "../lib/prisma";

export async function listManagedPlayers() {
  const rows = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      email: true,
      accountRole: true,
      blockedAt: true,
      profile: { select: { firstName: true, lastName: true } },
    },
  });
  rows.sort((a, b) => {
    const an = `${a.profile?.lastName ?? ""} ${a.profile?.firstName ?? ""}`.trim() || a.email;
    const bn = `${b.profile?.lastName ?? ""} ${b.profile?.firstName ?? ""}`.trim() || b.email;
    return an.localeCompare(bn, "tr");
  });
  return {
    data: rows.map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.profile?.firstName ?? "",
      lastName: row.profile?.lastName ?? "",
      accountRole: row.accountRole,
      blocked: row.blockedAt != null,
    })),
  };
}

export async function deletePlayer(actorId: string, userId: string): Promise<void> {
  if (actorId === userId) throw new AppError(400, "VALIDATION_ERROR", "Kendini silemezsin");
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
  if (!user) throw notFound("Oyuncu bulunamadı");

  await prisma.$transaction(async (tx) => {
    await tx.group.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.groupEvent.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.match.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.tournament.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.auditLog.updateMany({ where: { actorId: userId }, data: { actorId: null } });

    await tx.challenge.updateMany({ where: { challengerPartnerId: userId }, data: { challengerPartnerId: null } });
    await tx.challenge.updateMany({ where: { recipientPartnerId: userId }, data: { recipientPartnerId: null } });
    await tx.challenge.deleteMany({ where: { OR: [{ challengerId: userId }, { recipientId: userId }] } });

    await tx.tournamentMatch.updateMany({ where: { playerAId: userId }, data: { playerAId: null } });
    await tx.tournamentMatch.updateMany({ where: { playerAPartnerId: userId }, data: { playerAPartnerId: null } });
    await tx.tournamentMatch.updateMany({ where: { playerBId: userId }, data: { playerBId: null } });
    await tx.tournamentMatch.updateMany({ where: { playerBPartnerId: userId }, data: { playerBPartnerId: null } });
    await tx.tournamentMatch.updateMany({ where: { winnerId: userId }, data: { winnerId: null } });
    await tx.tournamentPlayer.deleteMany({ where: { userId } });

    await tx.matchOffer.updateMany({ where: { winnerId: userId }, data: { winnerId: null } });
    await tx.matchOffer.deleteMany({ where: { OR: [{ fromUserId: userId }, { toUserId: userId }] } });
    await tx.matchPlayer.deleteMany({ where: { userId } });

    await tx.courtReservation.updateMany({ where: { partnerId: userId }, data: { partnerId: null } });
    await tx.courtReservation.updateMany({ where: { decidedById: userId }, data: { decidedById: null } });
    await tx.courtReservation.updateMany({
      where: { createdById: userId, NOT: { holderId: userId } },
      data: { createdById: actorId },
    });
    const held = await tx.courtReservation.findMany({
      where: { OR: [{ holderId: userId }, { createdById: userId }] },
      select: { id: true },
    });
    const heldIds = held.map((row) => row.id);
    if (heldIds.length > 0) {
      await tx.slotOffer.deleteMany({ where: { reservationId: { in: heldIds } } });
      await tx.reservationCheckIn.deleteMany({ where: { reservationId: { in: heldIds } } });
      await tx.courtReservation.deleteMany({ where: { id: { in: heldIds } } });
    }
    await tx.reservationCheckIn.deleteMany({ where: { userId } });
    await tx.slotOffer.deleteMany({ where: { OR: [{ fromUserId: userId }, { toUserId: userId }] } });

    const seats = await tx.ladderPlayer.findMany({ where: { userId } });
    for (const seat of seats) {
      await tx.ladderPlayer.delete({ where: { id: seat.id } });
      const below = await tx.ladderPlayer.findMany({
        where: { ladderId: seat.ladderId, rank: { gt: seat.rank } },
        orderBy: { rank: "asc" },
      });
      for (const other of below) {
        await tx.ladderPlayer.update({ where: { id: other.id }, data: { rank: other.rank - 1 } });
      }
    }
    await tx.ladderHistory.deleteMany({ where: { userId } });
    await tx.ladderRematchLock.deleteMany({
      where: { OR: [{ challengerUserId: userId }, { lockedOpponentId: userId }] },
    });

    await tx.announcement.updateMany({ where: { authorId: userId }, data: { authorId: actorId } });
    await tx.user.delete({ where: { id: userId } });
  }, { timeout: 30_000 });
}

export async function setPlayerBlocked(actorId: string, userId: string, blocked: boolean): Promise<{ blocked: boolean }> {
  if (actorId === userId) {
    throw new AppError(400, "VALIDATION_ERROR", blocked ? "Kendini bloke edemezsin" : "Kendinin bloğunu kaldıramazsın");
  }
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, blockedAt: true },
  });
  if (!user) throw notFound("Oyuncu bulunamadı");
  if (!blocked) {
    await prisma.user.update({ where: { id: userId }, data: { blockedAt: null } });
    return { blocked: false };
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { blockedAt: user.blockedAt ?? new Date() },
    });
    await tx.matchOffer.updateMany({
      where: {
        winnerId: null,
        status: { in: ["PENDING", "ACCEPTED", "SCHEDULED"] },
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      data: { status: "REJECTED", respondedAt: new Date() },
    });
    await tx.challenge.updateMany({
      where: {
        deletedAt: null,
        status: { in: ["PENDING", "COUNTERED"] },
        OR: [
          { challengerId: userId },
          { recipientId: userId },
          { challengerPartnerId: userId },
          { recipientPartnerId: userId },
        ],
      },
      data: { status: "CANCELLED" },
    });
    await tx.slotOffer.updateMany({
      where: { status: "PENDING", OR: [{ fromUserId: userId }, { toUserId: userId }] },
      data: { status: "CANCELLED" },
    });
  });
  return { blocked: true };
}
