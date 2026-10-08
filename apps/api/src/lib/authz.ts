import type { Role } from "@club/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "./errors";
import { prisma } from "./prisma";

export const sessionUserSelect = {
  id: true,
  email: true,
  role: true,
  deletedAt: true,
  boardVisible: true,
  profile: { select: { firstName: true, lastName: true, photoUrl: true } },
} as const;

export type AuthUser = {
  id: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  boardVisible: boolean;
};

export function sessionAuthUser(user: {
  id: string;
  email: string;
  role: Role;
  boardVisible: boolean;
  profile: { firstName: string; lastName: string; photoUrl: string | null } | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    boardVisible: user.boardVisible,
    firstName: user.profile?.firstName ?? "",
    lastName: user.profile?.lastName ?? "",
    photoUrl: user.profile?.photoUrl ?? null,
  };
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.authUser) throw unauthorized();
  return req.authUser;
}

export function assertRole(user: AuthUser, roles: Role[]): void {
  if (user.role === "ADMIN") return;
  if (!roles.includes(user.role)) throw forbidden();
}

export function assertSelfOrRole(user: AuthUser, userId: string, roles: Role[]): void {
  if (user.id === userId) return;
  assertRole(user, roles);
}

export async function assertCanManageGroup(user: AuthUser, groupId: string): Promise<void> {
  if (user.role === "ADMIN" || user.role === "CLUB_MANAGER") return;
  if (user.role === "GROUP_MANAGER") {
    const membership = await prisma.groupMember.findFirst({
      where: { groupId, userId: user.id, role: "MANAGER" },
    });
    if (membership) return;
  }
  throw forbidden("Bu grubu yalnızca yöneticisi düzenleyebilir");
}

export function cookieBase(replyPath = "/") {
  return {
    path: replyPath,
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
    sameSite: (process.env.COOKIE_SAMESITE ?? "lax") as "lax" | "none" | "strict",
  };
}

export function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string): void {
  reply.setCookie("tc_access", accessToken, { ...cookieBase("/"), maxAge: 60 * 15 });
  reply.setCookie("tc_refresh", refreshToken, { ...cookieBase("/"), maxAge: 60 * 60 * 24 * 30 });
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie("tc_access", cookieBase("/"));
  reply.clearCookie("tc_refresh", cookieBase("/"));
}
