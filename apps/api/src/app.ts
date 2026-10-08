import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdir } from "node:fs/promises";
import { config } from "./config";
import { sessionAuthUser, sessionUserSelect } from "./lib/authz";
import { AppError } from "./lib/errors";
import { prisma } from "./lib/prisma";
import { verifyAccessToken } from "./lib/tokens";
import { activityRoutes } from "./routes/activity";
import { analyticsRoutes } from "./routes/analytics";
import { announcementRoutes } from "./routes/announcements";
import { calendarRoutes } from "./routes/calendar";
import { auditRoutes } from "./routes/audit";
import { authRoutes } from "./routes/auth";
import { challengeRoutes } from "./routes/challenges";
import { courtRoutes } from "./routes/courts";
import { friendRoutes } from "./routes/friends";
import { groupRoutes } from "./routes/groups";
import { homeRoutes } from "./routes/home";
import { ladderRoutes } from "./routes/ladders";
import { matchRoutes } from "./routes/matches";
import { notificationRoutes } from "./routes/notifications";
import { playerRoutes } from "./routes/players";
import { tournamentRoutes } from "./routes/tournaments";
import { userRoutes } from "./routes/users";
import "./types";

export async function createApp(options?: { logger?: boolean }): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options?.logger ?? config.nodeEnv === "development",
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.webOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });
  if (config.nodeEnv !== "test") {
    await app.register(rateLimit, {
      max: 300,
      timeWindow: "1 minute",
    });
  }

  app.decorateRequest("authUser", null);
  app.addHook("preHandler", async (req) => {
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const token = bearer || req.cookies.tc_access;
    if (!token) {
      req.authUser = null;
      return;
    }
    try {
      const payload = await verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: sessionUserSelect });
      if (!user || user.deletedAt) {
        req.authUser = null;
        return;
      }
      req.authUser = sessionAuthUser(user);
    } catch {
      req.authUser = null;
    }
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    if (statusCode === 429) {
      return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Çok fazla istek. Biraz bekleyip yeniden dene." } });
    }
    if (statusCode >= 400 && statusCode < 500) {
      const message = error instanceof Error ? error.message : "İstek işlenemedi";
      return reply.status(statusCode).send({ error: { code: "BAD_REQUEST", message } });
    }
    req.log.error(error);
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Beklenmeyen bir hata oluştu" } });
  });

  app.get("/api/health", async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(userRoutes);
  await app.register(playerRoutes);
  await app.register(groupRoutes);
  await app.register(challengeRoutes);
  await app.register(matchRoutes);
  await app.register(tournamentRoutes);
  await app.register(ladderRoutes);
  await app.register(announcementRoutes);
  await app.register(notificationRoutes);
  await app.register(friendRoutes);
  await app.register(homeRoutes);
  await app.register(activityRoutes);
  await app.register(analyticsRoutes);
  await app.register(calendarRoutes);
  await app.register(auditRoutes);
  await app.register(courtRoutes);

  await mkdir(config.uploadDir, { recursive: true });
  await app.register(fastifyStatic, { root: config.uploadDir, prefix: "/uploads/" });

  return app;
}
