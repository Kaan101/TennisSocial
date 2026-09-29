import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma";
import { recordLadderChange } from "../src/services/ladders";
import { auth, makeApp, registerUser } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
});

afterAll(async () => {
  await app.close();
});

test("a member can register for an open tournament", async () => {
  const manager = await registerUser(app, { firstName: "Turnuva", lastName: "Sorumlu" });
  const member = await registerUser(app, { firstName: "Katilim", lastName: "Uye" });
  await prisma.user.update({ where: { id: manager.user.id }, data: { role: "TOURNAMENT_MANAGER" } });
  const created = await app.inject({
    method: "POST",
    url: "/api/tournaments",
    headers: auth(manager.token),
    payload: { name: "Bahar Kupası", startDate: "2026-11-01", status: "REGISTRATION_OPEN" },
  });
  expect(created.statusCode).toBe(201);
  const joined = await app.inject({
    method: "POST",
    url: `/api/tournaments/${created.json().id}/players`,
    headers: auth(member.token),
    payload: {},
  });
  expect(joined.statusCode).toBe(201);
  const detail = await app.inject({
    method: "GET",
    url: `/api/tournaments/${created.json().id}`,
    headers: auth(member.token),
  });
  expect(detail.json().players.map((player: { userId: string }) => player.userId)).toContain(member.user.id);
});

test("ladder history records a rank change without rewriting the schema", async () => {
  const player = await registerUser(app, { firstName: "Merdiven", lastName: "Oyuncu" });
  const ladder = await prisma.ladder.create({ data: { name: "Kulüp Merdiveni" } });
  const first = await recordLadderChange({
    ladderId: ladder.id,
    userId: player.user.id,
    newRank: 3,
    newPoints: 40,
    reason: "Açılış",
  });
  expect(first.history.previousRank).toBeNull();
  const second = await recordLadderChange({
    ladderId: ladder.id,
    userId: player.user.id,
    newRank: 1,
    newPoints: 55,
    reason: "Galibiyet",
  });
  expect(second.history.previousRank).toBe(3);
  expect(second.player.rank).toBe(1);
  const listed = await app.inject({ method: "GET", url: `/api/ladders/${ladder.id}`, headers: auth(player.token) });
  expect(listed.statusCode).toBe(200);
  expect(listed.json().players[0].rank).toBe(1);
  expect(listed.json().history.length).toBe(2);
});
