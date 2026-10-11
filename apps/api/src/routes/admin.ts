import type { FastifyInstance } from "fastify";
import { adminParametersSchema } from "@club/shared";
import { assertAccountAdmin, requireUser } from "../lib/authz";
import { parse } from "../lib/errors";
import { readAdminParameters, writeAdminParameters } from "../services/adminParameters";
import { deletePlayer, listManagedPlayers, setPlayerBlocked } from "../services/playerAdmin";

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/players", async (req) => {
    const viewer = requireUser(req);
    assertAccountAdmin(viewer);
    return listManagedPlayers();
  });

  app.delete("/api/admin/players/:id", async (req) => {
    const viewer = requireUser(req);
    assertAccountAdmin(viewer);
    const { id } = req.params as { id: string };
    await deletePlayer(viewer.id, id);
    return { ok: true };
  });

  app.post("/api/admin/players/:id/block", async (req) => {
    const viewer = requireUser(req);
    assertAccountAdmin(viewer);
    const { id } = req.params as { id: string };
    return setPlayerBlocked(viewer.id, id, true);
  });

  app.post("/api/admin/players/:id/unblock", async (req) => {
    const viewer = requireUser(req);
    assertAccountAdmin(viewer);
    const { id } = req.params as { id: string };
    return setPlayerBlocked(viewer.id, id, false);
  });

  app.get("/api/admin/parameters", async (req) => {
    const viewer = requireUser(req);
    assertAccountAdmin(viewer);
    return readAdminParameters();
  });

  app.patch("/api/admin/parameters", async (req) => {
    const viewer = requireUser(req);
    assertAccountAdmin(viewer);
    const body = parse(adminParametersSchema, req.body);
    return writeAdminParameters(body);
  });
}
