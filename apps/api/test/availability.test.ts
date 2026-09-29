import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { istanbulNowParts } from "@club/shared";
import { auth, makeApp, registerUser } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
});

afterAll(async () => {
  await app.close();
});

test("weekly and one-off availability show up as available today", async () => {
  const viewer = await registerUser(app, { firstName: "Izleyen", lastName: "Uye" });
  const weekly = await registerUser(app, { firstName: "Haftalik", lastName: "Oyuncu" });
  const once = await registerUser(app, { firstName: "Bugun", lastName: "Musait" });
  const away = await registerUser(app, { firstName: "Sakat", lastName: "Oyuncu" });
  const { day, weekday } = istanbulNowParts();

  const saved = await app.inject({
    method: "PUT",
    url: `/api/users/${weekly.user.id}/availability`,
    headers: auth(weekly.token),
    payload: { weekly: [{ weekday, startTime: "18:00", endTime: "21:00" }], oneOff: [] },
  });
  expect(saved.statusCode).toBe(200);

  const oneOff = await app.inject({
    method: "PUT",
    url: `/api/users/${once.user.id}/availability`,
    headers: auth(once.token),
    payload: {
      weekly: [],
      oneOff: [{ date: day, startTime: "19:00", endTime: "22:00", note: "bugün 19:00 sonrası" }],
    },
  });
  expect(oneOff.statusCode).toBe(200);

  await app.inject({
    method: "PUT",
    url: `/api/users/${away.user.id}/availability`,
    headers: auth(away.token),
    payload: { weekly: [{ weekday, startTime: "18:00", endTime: "21:00" }], oneOff: [] },
  });
  await app.inject({
    method: "PATCH",
    url: `/api/users/${away.user.id}`,
    headers: auth(away.token),
    payload: { playerStatus: "INJURED", statusNote: "Kısa ara" },
  });

  const today = await app.inject({
    method: "GET",
    url: "/api/players/search?availableToday=true",
    headers: auth(viewer.token),
  });
  const ids = today.json().data.map((player: { id: string }) => player.id);
  expect(ids).toContain(weekly.user.id);
  expect(ids).toContain(once.user.id);
  expect(ids).not.toContain(away.user.id);

  const phrase = await app.inject({
    method: "GET",
    url: "/api/players/search?q=bugun%20musait",
    headers: auth(viewer.token),
  });
  expect(phrase.json().data.map((player: { id: string }) => player.id)).toContain(once.user.id);

  const weekendUser = await registerUser(app, { firstName: "Hafta", lastName: "Sonu" });
  await app.inject({
    method: "PUT",
    url: `/api/users/${weekendUser.user.id}/availability`,
    headers: auth(weekendUser.token),
    payload: { weekly: [{ weekday: 6, startTime: "09:00", endTime: "12:00" }], oneOff: [] },
  });
  const weekend = await app.inject({
    method: "GET",
    url: "/api/players/search?q=hafta%20sonu%20musait",
    headers: auth(viewer.token),
  });
  expect(weekend.json().data.map((player: { id: string }) => player.id)).toContain(weekendUser.user.id);
});
