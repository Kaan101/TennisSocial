import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { SKILLS } from "@club/shared";
import { scoreOpponent } from "../src/services/matchmaking/score";
import { auth, makeApp, registerUser } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
});

afterAll(async () => {
  await app.close();
});

test("score prefers similar level, district, and overlapping windows", () => {
  const close = scoreOpponent(
    {
      userId: "a",
      overallLevel: "INTERMEDIATE",
      skills: { FOREHAND: 6, BACKHAND: 6, SERVE: 6 },
      weekly: [{ weekday: 1, startTime: "18:00", endTime: "21:00" }],
      district: "Kadıköy",
      playPreference: "SINGLES",
      preferredPlayTimes: ["EVENING"],
      pastMatchCount: 1,
    },
    {
      userId: "b",
      overallLevel: "INTERMEDIATE_PLUS",
      skills: { FOREHAND: 6.5, BACKHAND: 6, SERVE: 6.2 },
      weekly: [{ weekday: 1, startTime: "19:00", endTime: "21:30" }],
      district: "Kadıköy",
      playPreference: "BOTH",
      preferredPlayTimes: ["EVENING"],
      pastMatchCount: 0,
    },
  );
  const far = scoreOpponent(
    {
      userId: "a",
      overallLevel: "BEGINNER",
      skills: { FOREHAND: 2, BACKHAND: 2, SERVE: 2 },
      weekly: [{ weekday: 2, startTime: "07:00", endTime: "08:00" }],
      district: "Sarıyer",
      playPreference: "DOUBLES",
      preferredPlayTimes: ["MORNING"],
      pastMatchCount: 0,
    },
    {
      userId: "c",
      overallLevel: "TOURNAMENT",
      skills: { FOREHAND: 9, BACKHAND: 9, SERVE: 9 },
      weekly: [{ weekday: 5, startTime: "21:00", endTime: "22:00" }],
      district: "Kadıköy",
      playPreference: "SINGLES",
      preferredPlayTimes: ["EVENING"],
      pastMatchCount: 0,
    },
  );
  expect(close.score).toBeGreaterThan(far.score);
  expect(close.reasons.join(" ")).toContain("semt");
});

test("suggested opponents exclude the viewer", async () => {
  const viewer = await registerUser(app, { firstName: "Ben", lastName: "Kendim" });
  const other = await registerUser(app, { firstName: "Rakip", lastName: "Aday" });
  await app.inject({
    method: "PUT",
    url: `/api/users/${viewer.user.id}/tennis-profile`,
    headers: auth(viewer.token),
    payload: { overallLevel: "INTERMEDIATE", skills: SKILLS.map((skill) => ({ skill, value: 5 })) },
  });
  await app.inject({
    method: "PUT",
    url: `/api/users/${other.user.id}/tennis-profile`,
    headers: auth(other.token),
    payload: { overallLevel: "INTERMEDIATE", skills: SKILLS.map((skill) => ({ skill, value: 5.5 })) },
  });
  const res = await app.inject({ method: "GET", url: "/api/players/suggested", headers: auth(viewer.token) });
  expect(res.statusCode).toBe(200);
  const ids = res.json().data.map((item: { user: { id: string } }) => item.user.id);
  expect(ids).toContain(other.user.id);
  expect(ids).not.toContain(viewer.user.id);
  expect(res.json().data[0].reasons.length).toBeGreaterThan(0);
});
