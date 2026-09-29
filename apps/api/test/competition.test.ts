import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../src/lib/prisma";
import { planAmericano, planDraw } from "../src/services/tournaments/draw";
import { auth, makeApp, registerUser } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
});

afterAll(async () => {
  await app.close();
});

async function managerToken() {
  const manager = await registerUser(app, { firstName: "Turnuva", lastName: "Yonetici" });
  await prisma.user.update({ where: { id: manager.user.id }, data: { role: "TOURNAMENT_MANAGER" } });
  return manager;
}

test("americano and group draws are real schedules", () => {
  const americano = planAmericano(["a", "b", "c", "d"]);
  expect(americano).toHaveLength(3);
  expect(americano.every((match) => match.playerAPartnerId && match.playerBPartnerId)).toBe(true);
  const groups = planDraw({
    format: "GROUPS_AND_KNOCKOUT",
    division: "SINGLES",
    players: ["p1", "p2", "p3", "p4", "p5", "p6"].map((userId) => ({ userId })),
    groupSize: 3,
  });
  expect(groups.every((match) => match.stage === "GROUP")).toBe(true);
  expect(new Set(groups.map((match) => match.groupKey)).size).toBe(2);
});

test("registration respects the cap and promotes the waiting list", async () => {
  const manager = await managerToken();
  const first = await registerUser(app, { firstName: "Ilk", lastName: "Kayit" });
  const filler = await registerUser(app, { firstName: "Ikinci", lastName: "Kayit" });
  const second = await registerUser(app, { firstName: "Yedek", lastName: "Kayit" });
  const created = await app.inject({
    method: "POST",
    url: "/api/tournaments",
    headers: auth(manager.token),
    payload: { name: "Kontenjan Kupası", startDate: "2026-11-02", status: "REGISTRATION_OPEN", maxPlayers: 2 },
  });
  expect(created.statusCode).toBe(201);
  const id = created.json().id as string;
  const joined = await app.inject({
    method: "POST",
    url: `/api/tournaments/${id}/players`,
    headers: auth(first.token),
    payload: {},
  });
  expect(joined.statusCode).toBe(201);
  expect(joined.json().status).toBe("REGISTERED");
  const also = await app.inject({
    method: "POST",
    url: `/api/tournaments/${id}/players`,
    headers: auth(filler.token),
    payload: {},
  });
  expect(also.statusCode).toBe(201);
  const waiting = await app.inject({
    method: "POST",
    url: `/api/tournaments/${id}/players`,
    headers: auth(second.token),
    payload: {},
  });
  expect(waiting.statusCode).toBe(201);
  expect(waiting.json().status).toBe("WAITING_LIST");
  const left = await app.inject({
    method: "POST",
    url: `/api/tournaments/${id}/withdraw`,
    headers: auth(first.token),
    payload: {},
  });
  expect(left.statusCode).toBe(200);
  const detail = await app.inject({ method: "GET", url: `/api/tournaments/${id}`, headers: auth(second.token) });
  const promoted = detail.json().players.find((player: { userId: string }) => player.userId === second.user.id);
  expect(promoted.status).toBe("REGISTERED");
});

test("level bounds reject a player outside the window", async () => {
  const manager = await managerToken();
  const player = await registerUser(app, { firstName: "Seviye", lastName: "Disi" });
  const created = await app.inject({
    method: "POST",
    url: "/api/tournaments",
    headers: auth(manager.token),
    payload: { name: "İleri Kupası", startDate: "2026-11-03", status: "REGISTRATION_OPEN", minLevel: "ADVANCED" },
  });
  const denied = await app.inject({
    method: "POST",
    url: `/api/tournaments/${created.json().id}/players`,
    headers: auth(player.token),
    payload: {},
  });
  expect(denied.statusCode).toBe(400);
  await prisma.tennisProfile.update({ where: { userId: player.user.id }, data: { overallLevel: "ADVANCED" } });
  const allowed = await app.inject({
    method: "POST",
    url: `/api/tournaments/${created.json().id}/players`,
    headers: auth(player.token),
    payload: {},
  });
  expect(allowed.statusCode).toBe(201);
});

test("a knockout score advances the winner", async () => {
  const manager = await managerToken();
  const players = await Promise.all(
    ["Ada", "Berk", "Cem", "Duru"].map((firstName) => registerUser(app, { firstName, lastName: "Eleme" })),
  );
  const created = await app.inject({
    method: "POST",
    url: "/api/tournaments",
    headers: auth(manager.token),
    payload: { name: "Eleme Test", startDate: "2026-11-04", format: "SINGLE_ELIMINATION", status: "REGISTRATION_OPEN" },
  });
  const id = created.json().id as string;
  for (const player of players) {
    const joined = await app.inject({
      method: "POST",
      url: `/api/tournaments/${id}/players`,
      headers: auth(manager.token),
      payload: { userId: player.user.id },
    });
    expect(joined.statusCode).toBe(201);
  }
  const draw = await app.inject({ method: "POST", url: `/api/tournaments/${id}/draw`, headers: auth(manager.token) });
  expect(draw.statusCode).toBe(200);
  const before = await app.inject({ method: "GET", url: `/api/tournaments/${id}`, headers: auth(manager.token) });
  const playable = before.json().matches.find((match: { canScore: boolean; round: number }) => match.canScore && match.round === 1);
  expect(playable).toBeTruthy();
  const scored = await app.inject({
    method: "POST",
    url: `/api/tournaments/${id}/matches/${playable.id}/result`,
    headers: auth(manager.token),
    payload: { score: "6-1 6-1", winnerSide: "A" },
  });
  expect(scored.statusCode).toBe(200);
  const after = await app.inject({ method: "GET", url: `/api/tournaments/${id}`, headers: auth(manager.token) });
  const final = after.json().matches.find((match: { roundLabel: string }) => match.roundLabel === "Final");
  expect([final.playerAId, final.playerBId]).toContain(playable.playerAId);
  const notes = await prisma.notification.count({
    where: { type: "TOURNAMENT_MATCH_ASSIGNED", link: `/turnuvalar/${id}` },
  });
  expect(notes).toBeGreaterThan(0);
});

test("round robin standings use the points system", async () => {
  const manager = await managerToken();
  const players = await Promise.all(
    ["Ela", "Fikret", "Gaye"].map((firstName) => registerUser(app, { firstName, lastName: "Lig" })),
  );
  const created = await app.inject({
    method: "POST",
    url: "/api/tournaments",
    headers: auth(manager.token),
    payload: { name: "Lig Test", startDate: "2026-11-05", format: "ROUND_ROBIN", status: "REGISTRATION_OPEN", pointsWin: 3, pointsLoss: 0 },
  });
  const id = created.json().id as string;
  for (const player of players) {
    await app.inject({
      method: "POST",
      url: `/api/tournaments/${id}/players`,
      headers: auth(manager.token),
      payload: { userId: player.user.id },
    });
  }
  await app.inject({ method: "POST", url: `/api/tournaments/${id}/draw`, headers: auth(manager.token) });
  const before = await app.inject({ method: "GET", url: `/api/tournaments/${id}`, headers: auth(manager.token) });
  const playable = before.json().matches.find((match: { canScore: boolean }) => match.canScore);
  const scored = await app.inject({
    method: "POST",
    url: `/api/tournaments/${id}/matches/${playable.id}/result`,
    headers: auth(manager.token),
    payload: { score: "6-4 6-3", winnerSide: "A" },
  });
  expect(scored.statusCode).toBe(200);
  const after = await app.inject({ method: "GET", url: `/api/tournaments/${id}`, headers: auth(manager.token) });
  const winner = after.json().standings.find((row: { userId: string }) => row.userId === playable.playerAId);
  const loser = after.json().standings.find((row: { userId: string }) => row.userId === playable.playerBId);
  expect(winner.points).toBe(3);
  expect(winner.won).toBe(1);
  expect(winner.setsWon).toBe(2);
  expect(loser.points).toBe(0);
  expect(loser.lost).toBe(1);
  const changed = await app.inject({
    method: "PATCH",
    url: `/api/tournaments/${id}/points`,
    headers: auth(manager.token),
    payload: { pointsWin: 2, pointsLoss: 1 },
  });
  expect(changed.statusCode).toBe(200);
  const rescored = await app.inject({ method: "GET", url: `/api/tournaments/${id}`, headers: auth(manager.token) });
  const winnerAgain = rescored.json().standings.find((row: { userId: string }) => row.userId === playable.playerAId);
  expect(winnerAgain.points).toBe(2);
});

test("ladder challenges outside the span are rejected and a win moves the rank", async () => {
  const players = await Promise.all(
    [1, 2, 3, 4, 5].map((rank) => registerUser(app, { firstName: `Sira${rank}`, lastName: "Merdiven" })),
  );
  const ladder = await prisma.ladder.create({ data: { name: "Test merdiveni", maxRankSpan: 3 } });
  for (let index = 0; index < players.length; index += 1) {
    await prisma.ladderPlayer.create({
      data: { ladderId: ladder.id, userId: players[index]!.user.id, rank: index + 1, points: 10 },
    });
  }
  const challenger = players[4]!;
  const tooFar = await app.inject({
    method: "POST",
    url: "/api/challenges",
    headers: auth(challenger.token),
    payload: {
      format: "SINGLE",
      recipientId: players[0]!.user.id,
      proposedDate: "2026-11-08",
      proposedTime: "19:00",
      ladderId: ladder.id,
    },
  });
  expect(tooFar.statusCode).toBe(400);
  const allowed = await app.inject({
    method: "POST",
    url: "/api/challenges",
    headers: auth(challenger.token),
    payload: {
      format: "SINGLE",
      recipientId: players[1]!.user.id,
      proposedDate: "2026-11-08",
      proposedTime: "19:00",
      ladderId: ladder.id,
    },
  });
  expect(allowed.statusCode).toBe(201);
  const accepted = await app.inject({
    method: "POST",
    url: `/api/challenges/${allowed.json().id}/accept`,
    headers: auth(players[1]!.token),
  });
  expect(accepted.statusCode).toBe(200);
  const result = await app.inject({
    method: "PATCH",
    url: `/api/matches/${accepted.json().matchId}/result`,
    headers: auth(challenger.token),
    payload: { score: "6-4 6-4", winnerSide: "A" },
  });
  expect(result.statusCode).toBe(200);
  const listed = await app.inject({ method: "GET", url: `/api/ladders/${ladder.id}`, headers: auth(challenger.token) });
  const moved = listed.json().players.find((player: { userId: string }) => player.userId === challenger.user.id);
  const dropped = listed.json().players.find((player: { userId: string }) => player.userId === players[1]!.user.id);
  expect(moved.rank).toBe(2);
  expect(dropped.rank).toBe(5);
  expect(listed.json().history.some((row: { userId: string; newRank: number }) => row.userId === challenger.user.id && row.newRank === 2)).toBe(true);
});

test("accepting a challenge creates an in-app notification", async () => {
  const challenger = await registerUser(app, { firstName: "Defi", lastName: "Gonderen" });
  const recipient = await registerUser(app, { firstName: "Defi", lastName: "Alan" });
  const created = await app.inject({
    method: "POST",
    url: "/api/challenges",
    headers: auth(challenger.token),
    payload: {
      format: "SINGLE",
      recipientId: recipient.user.id,
      proposedDate: "2026-11-09",
      proposedTime: "18:30",
    },
  });
  expect(created.statusCode).toBe(201);
  const accepted = await app.inject({
    method: "POST",
    url: `/api/challenges/${created.json().id}/accept`,
    headers: auth(recipient.token),
  });
  expect(accepted.statusCode).toBe(200);
  const notes = await prisma.notification.findMany({
    where: { userId: challenger.user.id, type: "CHALLENGE_ACCEPTED" },
  });
  expect(notes).toHaveLength(1);
  expect(notes[0]?.link).toContain("/maclar/");
});
