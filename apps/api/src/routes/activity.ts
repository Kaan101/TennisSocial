import type { FastifyInstance } from "fastify";
import { requireUser } from "../lib/authz";
import { listActivity } from "../services/activity";

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/activity", async (req) => {
    const viewer = requireUser(req);
    const query = req.query as { limit?: string };
    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 30) || 30));
    return { data: await listActivity(viewer, limit) };
  });
}
