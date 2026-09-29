import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { auth, makeApp, registerUser } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
});

afterAll(async () => {
  await app.close();
});

test("recording a result updates profile stats", async () => {
  const a = await registerUser(app, { firstName: "Selin", lastName: "Koç" });
  const b = await registerUser(app, { firstName: "Emre", lastName: "Şahin" });
  const created = await app.inject({
    method: "POST",
    url: "/api/matches",
    headers: auth(a.token),
    payload: {
      format: "SINGLE",
      scheduledDate: "2026-09-01",
      scheduledTime: "18:00",
      court: "Kort 1",
      players: [
        { userId: a.user.id, side: "A" },
        { userId: b.user.id, side: "B" },
      ],
    },
  });
  expect(created.statusCode).toBe(201);
  const id = created.json().id as string;
  const outsider = await registerUser(app);
  const denied = await app.inject({
    method: "PATCH",
    url: `/api/matches/${id}/result`,
    headers: auth(outsider.token),
    payload: { score: "6-3 6-4", winnerSide: "A" },
  });
  expect(denied.statusCode).toBe(403);

  const result = await app.inject({
    method: "PATCH",
    url: `/api/matches/${id}/result`,
    headers: auth(b.token),
    payload: { score: "6-3 6-4", winnerSide: "A" },
  });
  expect(result.statusCode).toBe(200);
  expect(result.json().status).toBe("COMPLETED");

  const profile = await app.inject({ method: "GET", url: `/api/users/${a.user.id}`, headers: auth(a.token) });
  expect(profile.json().stats.wins).toBe(1);
  expect(profile.json().stats.losses).toBe(0);
  expect(profile.json().stats.winRate).toBe(100);
  expect(profile.json().stats.lastFive).toHaveLength(1);

  const other = await app.inject({ method: "GET", url: `/api/users/${b.user.id}`, headers: auth(b.token) });
  expect(other.json().stats.losses).toBe(1);
});
