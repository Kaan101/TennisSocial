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

test("recipient can accept a challenge into a match", async () => {
  const a = await registerUser(app, { firstName: "Ali", lastName: "Bir" });
  const b = await registerUser(app, { firstName: "Bora", lastName: "Iki" });
  const created = await app.inject({
    method: "POST",
    url: "/api/challenges",
    headers: auth(a.token),
    payload: {
      format: "SINGLE",
      recipientId: b.user.id,
      proposedDate: "2026-10-10",
      proposedTime: "19:00",
      court: "Kort 1",
    },
  });
  expect(created.statusCode).toBe(201);
  const id = created.json().id as string;
  const accepted = await app.inject({
    method: "POST",
    url: `/api/challenges/${id}/accept`,
    headers: auth(b.token),
  });
  expect(accepted.statusCode).toBe(200);
  expect(accepted.json().challenge.status).toBe("ACCEPTED");
  const match = await app.inject({
    method: "GET",
    url: `/api/matches/${accepted.json().matchId}`,
    headers: auth(a.token),
  });
  expect(match.statusCode).toBe(200);
  expect(match.json().scheduledAt).toContain("2026-10-10");
});

test("recipient can decline", async () => {
  const a = await registerUser(app, { firstName: "Cem", lastName: "Uc" });
  const b = await registerUser(app, { firstName: "Deniz", lastName: "Dort" });
  const created = await app.inject({
    method: "POST",
    url: "/api/challenges",
    headers: auth(a.token),
    payload: { format: "SINGLE", recipientId: b.user.id, proposedDate: "2026-10-11", proposedTime: "18:00" },
  });
  const declined = await app.inject({
    method: "POST",
    url: `/api/challenges/${created.json().id}/decline`,
    headers: auth(b.token),
  });
  expect(declined.statusCode).toBe(200);
  expect(declined.json().status).toBe("DECLINED");
});

test("counter proposal can be accepted by the original challenger", async () => {
  const a = await registerUser(app, { firstName: "Ece", lastName: "Bes" });
  const b = await registerUser(app, { firstName: "Firat", lastName: "Alti" });
  const created = await app.inject({
    method: "POST",
    url: "/api/challenges",
    headers: auth(a.token),
    payload: { format: "SINGLE", recipientId: b.user.id, proposedDate: "2026-10-12", proposedTime: "17:00", court: "Kort 2" },
  });
  const id = created.json().id as string;
  const countered = await app.inject({
    method: "POST",
    url: `/api/challenges/${id}/counter`,
    headers: auth(b.token),
    payload: { proposedDate: "2026-10-13", proposedTime: "20:15", note: "Bir gün sonra olur." },
  });
  expect(countered.statusCode).toBe(200);
  expect(countered.json().status).toBe("COUNTERED");
  expect(countered.json().canRespond).toBe(false);

  const tooSoon = await app.inject({ method: "POST", url: `/api/challenges/${id}/accept`, headers: auth(b.token) });
  expect(tooSoon.statusCode).toBe(403);

  const accepted = await app.inject({ method: "POST", url: `/api/challenges/${id}/accept`, headers: auth(a.token) });
  expect(accepted.statusCode).toBe(200);
  const match = await app.inject({
    method: "GET",
    url: `/api/matches/${accepted.json().matchId}`,
    headers: auth(a.token),
  });
  expect(match.json().scheduledAt).toContain("2026-10-13T17:15:00");
});
