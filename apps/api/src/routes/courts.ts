import type { FastifyInstance } from "fastify";
import {
  boardVisibilitySchema,
  boardWeekSchema,
  checkInLeadSchema,
  clubCreateSchema,
  clubUpdateSchema,
  courtDaySchema,
  courtSlotSchema,
  courtCreateSchema,
  courtRangeSchema,
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
  cancelReservation,
  checkInReservation,
  courtWeekFor,
  createClub,
  createCourt,
  dayGridFor,
  deleteCourt,
  slotAt,
  createReservation,
  createSlotOffer,
  declineSlotOffer,
  getCheckInLeadHours,
  listClubs,
  listCourts,
  listReservations,
  listSlotOffers,
  rangeFor,
  rejectReservation,
  setBoardVisible,
  setCheckInLeadHours,
  updateClub,
  updateCourt,
} from "../services/courts/service";

export async function courtRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/clubs", async (req) => {
    requireUser(req);
    return listClubs();
  });

  app.post("/api/clubs", async (req, reply) => {
    requireUser(req);
    const body = parse(clubCreateSchema, req.body);
    return reply.status(201).send(await createClub(body));
  });

  app.patch("/api/clubs/:id", async (req) => {
    requireUser(req);
    const { id } = req.params as { id: string };
    const body = parse(clubUpdateSchema, req.body);
    return updateClub(id, body);
  });

  app.get("/api/courts", async (req) => {
    const viewer = requireUser(req);
    const query = parse(z.object({ all: z.string().optional(), club: z.string().min(1).optional() }), req.query);
    return listCourts(viewer, query.all === "true", query.club);
  });

  app.post("/api/courts", async (req, reply) => {
    const viewer = requireUser(req);
    const body = parse(courtCreateSchema, req.body);
    return reply.status(201).send(await createCourt(viewer, body));
  });

  app.delete("/api/courts/:id", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    return deleteCourt(viewer, id);
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
    return boardFor(viewer, query.week, [], query.club);
  });

  app.get("/api/courts/range", async (req) => {
    const viewer = requireUser(req);
    const query = parse(courtRangeSchema, req.query);
    return rangeFor(viewer, query);
  });

  app.get("/api/courts/day", async (req) => {
    const viewer = requireUser(req);
    const query = parse(courtDaySchema, req.query);
    return dayGridFor(viewer, query.date, query.club);
  });

  app.get("/api/courts/slot", async (req) => {
    const viewer = requireUser(req);
    const query = parse(courtSlotSchema, req.query);
    return slotAt(viewer, query.date, query.courtId, query.hour);
  });

  app.get("/api/courts/:id/week", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    const query = parse(boardWeekSchema, req.query);
    return courtWeekFor(viewer, id, query.week);
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

  app.post("/api/reservations/:id/cancel", async (req) => {
    const viewer = requireUser(req);
    const { id } = req.params as { id: string };
    return cancelReservation(viewer, id);
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
