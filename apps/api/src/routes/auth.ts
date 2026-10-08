import type { FastifyInstance } from "fastify";
import { forgotSchema, loginSchema, refreshSchema, registerSchema } from "@club/shared";
import { clearAuthCookies, setAuthCookies } from "../lib/authz";
import { AppError, parse, unauthorized } from "../lib/errors";
import { hashPassword, verifyPassword } from "../lib/password";
import { prisma } from "../lib/prisma";
import { issueSession, revokeRefreshToken, rotateRefreshToken } from "../services/session";

const authUserSelect = {
  id: true,
  email: true,
  role: true,
  profile: { select: { firstName: true, lastName: true, photoUrl: true } },
} as const;

function toAuthUser(user: {
  id: string;
  email: string;
  role: string;
  profile: { firstName: string; lastName: string; photoUrl: string | null } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.profile?.firstName ?? "",
    lastName: user.profile?.lastName ?? "",
    photoUrl: user.profile?.photoUrl ?? null,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/register", async (req, reply) => {
    const body = parse(registerSchema, req.body);
    const email = body.email.toLocaleLowerCase("tr-TR");
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, "CONFLICT", "Bu e-posta ile kayıt var");
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "MEMBER",
        profile: { create: { firstName: body.firstName, lastName: body.lastName, city: "İstanbul" } },
        privacy: { create: {} },
        tennisProfile: { create: {} },
      },
      select: authUserSelect,
    });
    const tokens = await issueSession(user, req.headers["user-agent"]);
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);
    return reply.status(201).send({ user: toAuthUser(user), tokens });
  });

  app.post("/login", async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const email = body.email.toLocaleLowerCase("tr-TR");
    const user = await prisma.user.findUnique({ where: { email }, select: { ...authUserSelect, passwordHash: true, deletedAt: true } });
    const invalid = unauthorized("E-posta veya parola hatalı");
    if (!user || user.deletedAt) throw invalid;
    const ok = await verifyPassword(user.passwordHash, body.password);
    if (!ok) throw invalid;
    const tokens = await issueSession(user, req.headers["user-agent"]);
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);
    return { user: toAuthUser(user), tokens };
  });

  app.post("/refresh", async (req, reply) => {
    const body = parse(refreshSchema, req.body ?? {});
    const token = body.refreshToken || req.cookies.tc_refresh;
    if (!token) throw unauthorized("Oturum yenilenemedi");
    const rotated = await rotateRefreshToken(token, req.headers["user-agent"]);
    setAuthCookies(reply, rotated.tokens.accessToken, rotated.tokens.refreshToken);
    const fresh = await prisma.user.findUnique({ where: { id: rotated.user.id }, select: authUserSelect });
    if (!fresh) throw unauthorized();
    return { user: toAuthUser(fresh), tokens: rotated.tokens };
  });

  app.post("/logout", async (req, reply) => {
    const body = parse(refreshSchema, req.body ?? {});
    await revokeRefreshToken(body.refreshToken || req.cookies.tc_refresh);
    clearAuthCookies(reply);
    return { ok: true };
  });

  app.get("/me", async (req) => {
    const user = req.authUser;
    if (!user) throw unauthorized();
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
      },
    };
  });

  app.post("/forgot-password", async (req) => {
    parse(forgotSchema, req.body);
    return {
      ok: true,
      message: "Hesap varsa sıfırlama bağlantısı gönderilir. E-posta servisi bu ortamda kapalı.",
    };
  });

  app.post("/reset-password", async () => {
    throw new AppError(501, "NOT_CONFIGURED", "E-posta gönderimi yapılandırılmadığı için parola sıfırlama henüz aktif değil");
  });
}
