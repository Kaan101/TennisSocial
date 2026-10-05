import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma";
import { auth, makeApp, registerUser } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
});

afterAll(async () => {
  await app.close();
});

test("a club ladder accepts a player once and stores a match offer the recipient can see", async () => {
  const host = await registerUser(app, { firstName: "Ev", lastName: "Sahibi" });
  const guest = await registerUser(app, { firstName: "Konuk", lastName: "Oyuncu" });
  const club = await app.inject({
    method: "POST",
    url: "/api/clubs",
    headers: auth(host.token),
    payload: { name: "Merdiven Kulübü" },
  });
  expect(club.statusCode).toBe(201);
  const clubId = club.json().id as string;

  const defined = await app.inject({
    method: "POST",
    url: "/api/ladders",
    headers: auth(host.token),
    payload: { name: "Açık kort", clubId },
  });
  expect(defined.statusCode).toBe(201);
  const ladderId = defined.json().id as string;

  const again = await app.inject({
    method: "POST",
    url: "/api/ladders/ensure",
    headers: auth(host.token),
    payload: { clubId },
  });
  expect(again.statusCode).toBe(200);
  expect(again.json().created).toBe(false);

  const first = await app.inject({
    method: "POST",
    url: `/api/ladders/${ladderId}/players`,
    headers: auth(host.token),
    payload: { userId: guest.user.id },
  });
  expect(first.statusCode).toBe(201);
  expect(first.json().added).toBe(true);

  const duplicate = await app.inject({
    method: "POST",
    url: `/api/ladders/${ladderId}/players`,
    headers: auth(host.token),
    payload: { userId: guest.user.id },
  });
  expect(duplicate.statusCode).toBe(200);
  expect(duplicate.json().added).toBe(false);
  expect(duplicate.json().rank).toBe(first.json().rank);

  const seats = await prisma.ladderPlayer.count({ where: { ladderId, userId: guest.user.id } });
  expect(seats).toBe(1);

  const offer = await app.inject({
    method: "POST",
    url: "/api/match-offers",
    headers: auth(host.token),
    payload: { toUserId: guest.user.id, clubId },
  });
  expect(offer.statusCode).toBe(201);
  expect(offer.json()).toMatchObject({
    fromUserId: host.user.id,
    toUserId: guest.user.id,
    clubId,
    status: "PENDING",
  });

  const seen = await app.inject({
    method: "GET",
    url: `/api/match-offers?clubId=${clubId}`,
    headers: auth(guest.token),
  });
  expect(seen.statusCode).toBe(200);
  expect(seen.json().data).toEqual([
    expect.objectContaining({
      id: offer.json().id,
      fromUserId: host.user.id,
      toUserId: guest.user.id,
      clubId,
      status: "PENDING",
    }),
  ]);

  const stored = await prisma.matchOffer.findUnique({ where: { id: offer.json().id as string } });
  expect(stored?.status).toBe("PENDING");
});

test("a result swaps the two seats and an offer older than seven days is not pending", async () => {
  const lower = await registerUser(app, { firstName: "Alt", lastName: "Oyuncu" });
  const upper = await registerUser(app, { firstName: "Ust", lastName: "Oyuncu" });
  const club = await app.inject({
    method: "POST",
    url: "/api/clubs",
    headers: auth(lower.token),
    payload: { name: "Sonuç Kulübü" },
  });
  const clubId = club.json().id as string;
  const ladder = await app.inject({
    method: "POST",
    url: "/api/ladders",
    headers: auth(lower.token),
    payload: { name: "Sıra", clubId },
  });
  const ladderId = ladder.json().id as string;
  await app.inject({
    method: "POST",
    url: `/api/ladders/${ladderId}/players`,
    headers: auth(lower.token),
    payload: { userId: upper.user.id },
  });
  await app.inject({
    method: "POST",
    url: `/api/ladders/${ladderId}/players`,
    headers: auth(lower.token),
    payload: { userId: lower.user.id },
  });

  const offer = await app.inject({
    method: "POST",
    url: "/api/match-offers",
    headers: auth(lower.token),
    payload: { toUserId: upper.user.id, clubId, ladderId },
  });
  expect(offer.statusCode).toBe(201);

  const listed = await app.inject({
    method: "GET",
    url: `/api/ladders?clubId=${clubId}`,
    headers: auth(upper.token),
  });
  const shown = listed.json().data[0].offers[0];
  expect(shown.fromName).toBe("Alt Oyuncu");
  expect(shown.daysLeft).toBe(7);

  const result = await app.inject({
    method: "POST",
    url: `/api/match-offers/${offer.json().id}/result`,
    headers: auth(lower.token),
    payload: { winnerId: lower.user.id },
  });
  expect(result.statusCode).toBe(200);
  const seats = await prisma.ladderPlayer.findMany({ where: { ladderId }, orderBy: { rank: "asc" } });
  expect(seats.map((seat) => seat.userId)).toEqual([lower.user.id, upper.user.id]);
  expect(seats[0]?.lastMove).toBe("UP");
  expect(seats[1]?.lastMove).toBe("DOWN");

  const stale = await prisma.matchOffer.create({
    data: {
      fromUserId: upper.user.id,
      toUserId: lower.user.id,
      clubId,
      ladderId,
      status: "PENDING",
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });
  const hidden = await app.inject({
    method: "GET",
    url: `/api/match-offers?clubId=${clubId}`,
    headers: auth(lower.token),
  });
  expect(hidden.json().data.map((row: { id: string }) => row.id)).not.toContain(stale.id);
  const late = await app.inject({
    method: "POST",
    url: `/api/match-offers/${stale.id}/result`,
    headers: auth(upper.token),
    payload: { winnerId: upper.user.id },
  });
  expect(late.statusCode).toBe(400);
});
