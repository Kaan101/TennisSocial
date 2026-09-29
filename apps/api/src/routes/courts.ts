import type { FastifyInstance } from "fastify";
import {
  boardVisibilitySchema,
  boardWeekSchema,
  checkInLeadSchema,
  courtCreateSchema,
  courtReservationSchema,
  courtUpdateSchema,
  reservationCheckInSchema,
  reservationListSchema,
  slotOfferListSchema,
  slotOfferSchema,
} from "@club/shared";
import { z } from "zod";
import { requireUser } from "../lib/authz";
import { parse } from "../lib/errors";
import {
  acceptSlotOffer,
  approveReservation,
  boardFor,
  checkInReservation,
  createCourt,
  createReservation,
  createSlotOffer,
  declineSlotOffer,
  getCheckInLeadHours,
  listCourts,
  listReservations,
  listSlotOffers,
  rejectReservation,
  setBoardVisible,
  setCheckInLeadHours,
  updateCourt,
} from "../services/courts/service";

export async function courtRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/courts", async (req) => {
    const viewer = requireUser(req);
    const query = parse(z.object({ all: z.string().optional() }), req.query);
    return listCourts(viewer, query.all === "true");
  });

  app.post("/api/courts", async (req, reply) => {
    const viewer = requireUser(req);
    const body = parse(courtCreateSchema, req.body);
    return reply.status(201).send(await createCourt(viewer, body.name));
  });

  app.patch("/api/courts/:id", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(courtUpdateSchema, req.body);
    return updateCourt(viewer, id, body);
  });

  app.get("/api/courts/board", async (req) => {
    const viewer = requireUser(req);
    const query = parse(boardWeekSchema, req.query);
    return boardFor(viewer, query.week);
  });

  app.get("/api/reservations", async (req) => {
    const viewer = requireUser(req);
    const query = parse(reservationListSchema, req.query);
    return listReservations(viewer, query);
  });

  app.post("/api/reservations", async (req, reply) => {
    const viewer = requireUser(req);
    const body = parse(courtReservationSchema, req.body);
    return reply.status(201).send(await createReservation(viewer, body));
  });

  app.post("/api/reservations/:id/approve", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    return approveReservation(viewer, id);
  });

  app.post("/api/reservations/:id/reject", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    return rejectReservation(viewer, id);
  });

  app.post("/api/reservations/:id/check-in", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(reservationCheckInSchema, req.body);
    return checkInReservation(viewer, id, body);
  });

  app.patch("/api/me/board-visibility", async (req) => {
    const viewer = requireUser(req);
    const body = parse(boardVisibilitySchema, req.body);
    return setBoardVisible(viewer, body.visible);
  });

  app.get("/api/settings/check-in-lead", async (req) => {
    requireUser(req);
    return { hours: await getCheckInLeadHours() };
  });

  app.patch("/api/settings/check-in-lead", async (req) => {
    const viewer = requireUser(req);
    const body = parse(checkInLeadSchema, req.body);
    return { hours: await setCheckInLeadHours(viewer, body.hours) };
  });

  app.get("/api/slot-offers", async (req) => {
    const viewer = requireUser(req);
    const query = parse(slotOfferListSchema, req.query);
    return listSlotOffers(viewer, query.scope);
  });

  app.post("/api/slot-offers", async (req, reply) => {
    const viewer = requireUser(req);
    const body = parse(slotOfferSchema, req.body);
    return reply.status(201).send(await createSlotOffer(viewer, body));
  });

  app.post("/api/slot-offers/:id/accept", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    return acceptSlotOffer(viewer, id);
  });

  app.post("/api/slot-offers/:id/decline", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    return declineSlotOffer(viewer, id);
  });
}
