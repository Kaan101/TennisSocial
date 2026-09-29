import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { SKILLS } from "@club/shared";
import { auth, makeApp, registerUser } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
});

afterAll(async () => {
  await app.close();
});

async function setLevel(
  token: string,
  id: string,
  overallLevel: string,
  skills: { skill: string; value: number }[],
  extra?: Record<string, unknown>,
) {
  const res = await app.inject({
    method: "PUT",
    url: `/api/users/${id}/tennis-profile`,
    headers: auth(token),
    payload: { overallLevel, skills, ...extra },
  });
  expect(res.statusCode).toBe(200);
}

test("search filters by name, level label, skill, backhand, and racket", async () => {
  const viewer = await registerUser(app, { firstName: "Arayan", lastName: "Uye" });
  const elif = await registerUser(app, { firstName: "Elif", lastName: "Demir" });
  const strong = await registerUser(app, { firstName: "Kaan", lastName: "Doğan" });
  const oneHand = await registerUser(app, { firstName: "Cem", lastName: "Aslan" });

  await setLevel(elif.token, elif.user.id, "INTERMEDIATE_PLUS", SKILLS.map((skill) => ({ skill, value: skill === "FOREHAND" ? 6.5 : 5 })));
  await setLevel(
    strong.token,
    strong.user.id,
    "ADVANCED",
    SKILLS.map((skill) => ({ skill, value: skill === "FOREHAND" ? 8.5 : 7 })),
  );
  await setLevel(oneHand.token, oneHand.user.id, "INTERMEDIATE", SKILLS.map((skill) => ({ skill, value: 5 })), {
    backhandType: "ONE_HANDED",
  });
  const racket = await app.inject({
    method: "POST",
    url: `/api/users/${elif.user.id}/rackets`,
    headers: auth(elif.token),
    payload: { brand: "Wilson", model: "Blade 98", isPrimary: true },
  });
  expect(racket.statusCode).toBe(201);

  const byName = await app.inject({
    method: "GET",
    url: "/api/players/search?q=Elif",
    headers: auth(viewer.token),
  });
  expect(byName.statusCode).toBe(200);
  expect(byName.json().data.some((player: { id: string }) => player.id === elif.user.id)).toBe(true);

  const byLevel = await app.inject({
    method: "GET",
    url: "/api/players/search?q=orta%2B",
    headers: auth(viewer.token),
  });
  const levelIds = byLevel.json().data.map((player: { id: string }) => player.id);
  expect(levelIds).toContain(elif.user.id);
  expect(levelIds).not.toContain(strong.user.id);

  const bySkill = await app.inject({
    method: "GET",
    url: "/api/players/search?q=forehand%208%2B",
    headers: auth(viewer.token),
  });
  const skillIds = bySkill.json().data.map((player: { id: string }) => player.id);
  expect(skillIds).toContain(strong.user.id);
  expect(skillIds).not.toContain(elif.user.id);

  const byBackhand = await app.inject({
    method: "GET",
    url: "/api/players/search?q=tek%20el%20backhand",
    headers: auth(viewer.token),
  });
  expect(byBackhand.json().data.map((player: { id: string }) => player.id)).toContain(oneHand.user.id);

  const byRacket = await app.inject({
    method: "GET",
    url: "/api/players/search?q=Wilson%20Blade",
    headers: auth(viewer.token),
  });
  expect(byRacket.json().data.map((player: { id: string }) => player.id)).toContain(elif.user.id);
});
