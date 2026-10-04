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
