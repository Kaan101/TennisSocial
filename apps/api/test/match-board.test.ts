import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma";
import { playerMark } from "../src/services/matchBoard";
import { auth, makeApp, registerUser } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
});

afterAll(async () => {
  await app.close();
});

test("player marks keep the first letters, including Turkish and Ś", () => {
  expect(playerMark("Selin", "Horvat")).toBe("S. H.");
  expect(playerMark("Iga", "Świątek")).toBe("I. Ś.");
  expect(playerMark("İpek", "Şahin")).toBe("İ. Ş.");
  expect(playerMark("ışıl", "çelik")).toBe("I. Ç.");
});

test("the match board lists planned matches, scheduled ladder challenges, and played defi matches", async () => {
  const selin = await registerUser(app, { firstName: "Selin", lastName: "Horvat" });
  const iga = await registerUser(app, { firstName: "Iga", lastName: "Świątek" });
  const ipek = await registerUser(app, { firstName: "İpek", lastName: "Şahin" });
  const club = await app.inject({
    method: "POST",
    url: "/api/clubs",
    headers: auth(selin.token),
    payload: { name: "Maç Kulübü" },
  });
  expect(club.statusCode).toBe(201);
  const clubId = club.json().id as string;

  const otherClub = await app.inject({
    method: "POST",
    url: "/api/clubs",
    headers: auth(selin.token),
    payload: { name: "Başka Kulüp" },
  });
  const otherClubId = otherClub.json().id as string;
  const otherLadder = await app.inject({
    method: "POST",
    url: "/api/ladders",
    headers: auth(selin.token),
    payload: { name: "Diğer", clubId: otherClubId },
  });
  const otherLadderId = otherLadder.json().id as string;

  const planned = await app.inject({
    method: "POST",
    url: "/api/matches",
    headers: auth(selin.token),
    payload: {
      format: "SINGLE",
      scheduledDate: "2026-10-08",
      scheduledTime: "18:30",
      court: "Kort 1",
      players: [
        { userId: selin.user.id, side: "A" },
        { userId: iga.user.id, side: "B" },
      ],
    },
  });
  expect(planned.statusCode).toBe(201);
  const plannedId = planned.json().id as string;

  const cancelled = await app.inject({
    method: "POST",
    url: "/api/matches",
    headers: auth(selin.token),
    payload: {
      format: "SINGLE",
      scheduledDate: "2026-10-08",
      scheduledTime: "19:00",
      players: [
        { userId: selin.user.id, side: "A" },
        { userId: iga.user.id, side: "B" },
      ],
    },
  });
  const cancelledId = cancelled.json().id as string;
  const cancel = await app.inject({
    method: "POST",
    url: `/api/matches/${cancelledId}/cancel`,
    headers: auth(selin.token),
  });
  expect(cancel.statusCode).toBe(200);

  const ladder = await app.inject({
    method: "POST",
    url: "/api/ladders",
    headers: auth(selin.token),
    payload: { name: "Açık", clubId },
  });
  expect(ladder.statusCode).toBe(201);
  const ladderId = ladder.json().id as string;
  await app.inject({
    method: "POST",
    url: `/api/ladders/${ladderId}/players`,
    headers: auth(selin.token),
    payload: { userId: selin.user.id },
  });
  await app.inject({
    method: "POST",
    url: `/api/ladders/${ladderId}/players`,
    headers: auth(selin.token),
    payload: { userId: ipek.user.id },
  });

  const offer = await app.inject({
    method: "POST",
    url: "/api/match-offers",
    headers: auth(ipek.token),
    payload: { toUserId: selin.user.id, clubId, ladderId },
  });
  expect(offer.statusCode).toBe(201);
  const offerId = offer.json().id as string;
  const accepted = await app.inject({
    method: "POST",
    url: `/api/match-offers/${offerId}/accept`,
    headers: auth(selin.token),
  });
  expect(accepted.statusCode).toBe(200);
  const scheduledAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  scheduledAt.setUTCMinutes(0, 0, 0);
  const scheduled = await app.inject({
    method: "POST",
    url: `/api/match-offers/${offerId}/schedule`,
    headers: auth(ipek.token),
    payload: { scheduledAt: scheduledAt.toISOString() },
  });
  expect(scheduled.statusCode).toBe(200);

  const played = await prisma.match.create({
    data: {
      format: "SINGLE",
      scheduledAt: new Date("2026-10-09T07:00:00.000Z"),
      status: "COMPLETED",
      kind: "DEFI",
      ladderId,
      score: "6-4 6-3",
      winnerSide: "A",
      createdById: selin.user.id,
      players: {
        create: [
          { userId: selin.user.id, side: "A" },
          { userId: ipek.user.id, side: "B" },
        ],
      },
    },
  });

  const court = await prisma.court.create({ data: { clubId, name: "Kort A" } });
  const courtMatch = await prisma.match.create({
    data: {
      format: "SINGLE",
      scheduledAt: new Date("2026-10-07T06:00:00.000Z"),
      status: "SCHEDULED",
      court: court.name,
      createdById: selin.user.id,
      players: {
        create: [
          { userId: selin.user.id, side: "A" },
          { userId: iga.user.id, side: "B" },
        ],
      },
    },
  });
  await prisma.courtReservation.create({
    data: {
      courtId: court.id,
      purpose: "MATCH",
      status: "APPROVED",
      startDate: new Date("2026-10-07T00:00:00.000Z"),
      endDate: new Date("2026-10-07T00:00:00.000Z"),
      weekdays: [3],
      startTime: "09:00",
      endTime: "10:00",
      holderId: selin.user.id,
      createdById: selin.user.id,
      matchId: courtMatch.id,
    },
  });

  const elsewhere = await prisma.match.create({
    data: {
      format: "SINGLE",
      scheduledAt: new Date("2026-10-11T08:00:00.000Z"),
      status: "SCHEDULED",
      ladderId: otherLadderId,
      createdById: selin.user.id,
      players: {
        create: [
          { userId: selin.user.id, side: "A" },
          { userId: iga.user.id, side: "B" },
        ],
      },
    },
  });

  const closedOffer = await prisma.matchOffer.create({
    data: {
      fromUserId: ipek.user.id,
      toUserId: selin.user.id,
      clubId,
      ladderId,
      status: "SCHEDULED",
      scheduledAt: new Date("2026-10-12T08:00:00.000Z"),
      winnerId: selin.user.id,
      acceptedAt: new Date(),
    },
  });

  const board = await app.inject({
    method: "GET",
    url: `/api/matches/board?club=${clubId}`,
    headers: auth(iga.token),
  });
  expect(board.statusCode).toBe(200);
  const rows = board.json().matches as {
    id: string;
    source: string;
    scheduledAt: string;
    date: string;
    startTime: string;
    status: string;
    kind: string;
    score: string | null;
    winnerName: string | null;
    players: { firstName: string; lastName: string; side: string; mark: string }[];
  }[];

  const ids = rows.map((row) => row.id);
  expect(ids).toContain(plannedId);
  expect(ids).toContain(offerId);
  expect(ids).toContain(played.id);
  expect(ids).toContain(courtMatch.id);
  expect(ids).not.toContain(cancelledId);
  expect(ids).not.toContain(elsewhere.id);
  expect(ids).not.toContain(closedOffer.id);

  const plannedRow = rows.find((row) => row.id === plannedId);
  expect(plannedRow).toMatchObject({
    source: "match",
    date: "2026-10-08",
    startTime: "18:00",
    status: "SCHEDULED",
    kind: "NORMAL",
    score: null,
  });
  expect(plannedRow?.players.map((player) => player.mark)).toEqual(["S. H.", "I. Ś."]);
  expect(plannedRow?.players[1]).toMatchObject({ firstName: "Iga", lastName: "Świątek" });

  const offerRow = rows.find((row) => row.id === offerId);
  expect(offerRow).toMatchObject({ source: "offer", status: "SCHEDULED", kind: "DEFI", score: null, winnerName: null });
  expect(offerRow?.players.map((player) => player.mark)).toEqual(["İ. Ş.", "S. H."]);

  const playedRow = rows.find((row) => row.id === played.id);
  expect(playedRow).toMatchObject({
    source: "match",
    status: "COMPLETED",
    kind: "DEFI",
    score: "6-4 6-3",
    winnerName: "Selin Horvat",
    date: "2026-10-09",
    startTime: "10:00",
  });

  const courtRow = rows.find((row) => row.id === courtMatch.id);
  expect(courtRow).toMatchObject({ source: "match", date: "2026-10-07", startTime: "09:00", kind: "NORMAL" });

  const times = rows.map((row) => Date.parse(row.scheduledAt));
  const sorted = [...times].sort((left, right) => right - left);
  expect(times).toEqual(sorted);
  expect(rows.some((row) => row.winnerName === "Selin Horvat" && row.id !== played.id && row.source === "offer")).toBe(false);
});
