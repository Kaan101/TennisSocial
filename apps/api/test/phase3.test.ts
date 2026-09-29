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

async function play(token: string, a: string, b: string, date: string, court: string) {
  const created = await app.inject({
    method: "POST",
    url: "/api/matches",
    headers: auth(token),
    payload: {
      format: "SINGLE",
      scheduledDate: date,
      scheduledTime: "18:00",
      court,
      players: [
        { userId: a, side: "A" },
        { userId: b, side: "B" },
      ],
    },
  });
  expect(created.statusCode).toBe(201);
  return created.json().id as string;
}

test("activity stays hidden when the actor turns visibility off", async () => {
  const actor = await registerUser(app, { firstName: "Aylin", lastName: "Ak" });
  const viewer = await registerUser(app, { firstName: "Bora", lastName: "Bal" });
  const id = await play(actor.token, actor.user.id, viewer.user.id, "2026-09-01", "Kort 2");
  const recorded = await app.inject({
    method: "PATCH",
    url: `/api/matches/${id}/result`,
    headers: auth(actor.token),
    payload: { score: "6-4 6-2", winnerSide: "A" },
  });
  expect(recorded.statusCode).toBe(200);

  const visible = await app.inject({ method: "GET", url: "/api/activity", headers: auth(viewer.token) });
  expect(visible.statusCode).toBe(200);
  expect(visible.json().data.some((item: { actorId: string }) => item.actorId === actor.user.id)).toBe(true);

  const hidden = await app.inject({
    method: "PUT",
    url: `/api/users/${actor.user.id}/privacy`,
    headers: auth(actor.token),
    payload: { activityVisibility: "HIDDEN" },
  });
  expect(hidden.statusCode).toBe(200);

  const filtered = await app.inject({ method: "GET", url: "/api/activity", headers: auth(viewer.token) });
  expect(filtered.json().data.some((item: { actorId: string }) => item.actorId === actor.user.id)).toBe(false);

  const own = await app.inject({ method: "GET", url: "/api/activity", headers: auth(actor.token) });
  expect(own.json().data.some((item: { actorId: string }) => item.actorId === actor.user.id)).toBe(true);
});

test("club analytics is forbidden for members", async () => {
  const member = await registerUser(app);
  const denied = await app.inject({ method: "GET", url: "/api/analytics", headers: auth(member.token) });
  expect(denied.statusCode).toBe(403);

  const manager = await registerUser(app, { firstName: "Yonetici", lastName: "Deneme" });
  await prisma.user.update({ where: { id: manager.user.id }, data: { role: "CLUB_MANAGER" } });
  const allowed = await app.inject({ method: "GET", url: "/api/analytics", headers: auth(manager.token) });
  expect(allowed.statusCode).toBe(200);
  expect(typeof allowed.json().memberCount).toBe("number");
  expect(Array.isArray(allowed.json().tournaments)).toBe(true);
});

test("head-to-head counts only matches between the profile and the viewer", async () => {
  const a = await registerUser(app, { firstName: "Cem", lastName: "Can" });
  const b = await registerUser(app, { firstName: "Deniz", lastName: "Dal" });
  const c = await registerUser(app, { firstName: "Eda", lastName: "Efe" });
  const id = await play(a.token, a.user.id, b.user.id, "2026-09-02", "Kort 1");
  const result = await app.inject({
    method: "PATCH",
    url: `/api/matches/${id}/result`,
    headers: auth(a.token),
    payload: { score: "6-3 6-4", winnerSide: "A" },
  });
  expect(result.statusCode).toBe(200);

  const other = await play(a.token, a.user.id, c.user.id, "2026-09-03", "Kort 3");
  await app.inject({
    method: "PATCH",
    url: `/api/matches/${other}/result`,
    headers: auth(a.token),
    payload: { score: "6-0 6-0", winnerSide: "A" },
  });

  const profile = await app.inject({ method: "GET", url: `/api/users/${b.user.id}`, headers: auth(a.token) });
  expect(profile.json().stats.headToHead).toEqual({ played: 1, wins: 0, losses: 1 });
  expect(profile.json().stats.gamesWon).toBe(7);

  const self = await app.inject({ method: "GET", url: `/api/users/${a.user.id}`, headers: auth(a.token) });
  expect(self.json().stats.headToHead).toBeNull();
  expect(self.json().stats.setsWon).toBe(4);
  expect(self.json().stats.gamesWon).toBe(24);
});

test("calendar file lists only the viewer's upcoming matches", async () => {
  const a = await registerUser(app, { firstName: "Fatih", lastName: "Fen" });
  const b = await registerUser(app, { firstName: "Gaye", lastName: "Gul" });
  const c = await registerUser(app, { firstName: "Hale", lastName: "Han" });
  const d = await registerUser(app, { firstName: "Irmak", lastName: "Ipek" });
  await play(a.token, a.user.id, b.user.id, "2026-12-01", "KORT-A-ONLY");
  await play(c.token, c.user.id, d.user.id, "2026-12-02", "KORT-C-SECRET");

  const ics = await app.inject({ method: "GET", url: "/api/calendar.ics", headers: auth(a.token) });
  expect(ics.statusCode).toBe(200);
  expect(ics.headers["content-type"]).toContain("text/calendar");
  expect(ics.body).toContain("KORT-A-ONLY");
  expect(ics.body).not.toContain("KORT-C-SECRET");
});
