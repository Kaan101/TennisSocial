import { prisma } from "../lib/prisma";
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_MS,
  hashRefreshToken,
  newRefreshToken,
  signAccessToken,
} from "../lib/tokens";
import { AppError } from "../lib/errors";

export async function issueSession(user: { id: string; email: string; role: string }, userAgent?: string) {
  const refresh = newRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.tokenHash,
      familyId: refresh.familyId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent,
    },
  });
  const accessToken = await signAccessToken(user);
  return { accessToken, refreshToken: refresh.token, expiresIn: ACCESS_TTL_SECONDS };
}

export async function rotateRefreshToken(token: string, userAgent?: string) {
  const tokenHash = hashRefreshToken(token);
  const current = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!current || current.user.deletedAt) {
    throw new AppError(401, "UNAUTHENTICATED", "Oturum yenilenemedi");
  }
  if (current.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: current.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError(401, "REFRESH_REUSED", "Oturum güvenliği için kapatıldı. Yeniden giriş yap.");
  }
  if (current.expiresAt.getTime() < Date.now()) {
    throw new AppError(401, "UNAUTHENTICATED", "Oturum süresi doldu");
  }
  const next = newRefreshToken();
  const created = await prisma.refreshToken.create({
    data: {
      userId: current.userId,
      tokenHash: next.tokenHash,
      familyId: current.familyId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent,
    },
  });
  await prisma.refreshToken.update({
    where: { id: current.id },
    data: { revokedAt: new Date(), replacedBy: created.id },
  });
  const accessToken = await signAccessToken(current.user);
  return {
    user: current.user,
    tokens: { accessToken, refreshToken: next.token, expiresIn: ACCESS_TTL_SECONDS },
  };
}

export async function revokeRefreshToken(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = hashRefreshToken(token);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
