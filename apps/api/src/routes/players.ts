import type { FastifyInstance } from "fastify";
import { playerSearchSchema } from "@club/shared";
import { requireUser } from "../lib/authz";
import { parse } from "../lib/errors";
import { matchmaker } from "../services/matchmaking/service";
import { searchPlayers } from "../services/search";

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/players/search", async (req) => {
    const viewer = requireUser(req);
    const query = parse(playerSearchSchema, req.query);
    return searchPlayers(viewer, query);
  });

  app.get("/api/players/suggested", async (req) => {
    const viewer = requireUser(req);
    const query = req.query as { limit?: string };
    const limit = Math.min(20, Math.max(1, Number(query.limit ?? 8) || 8));
    const data = await matchmaker.suggest(viewer.id, limit);
    return { data };
  });
}
