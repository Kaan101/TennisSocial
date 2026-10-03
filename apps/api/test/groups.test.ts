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

test("group type is required and existing rows keep the defaults", async () => {
  const manager = await registerUser(app, { firstName: "Grup", lastName: "Sorumlu" });
  await prisma.user.update({ where: { id: manager.user.id }, data: { role: "CLUB_MANAGER" } });

  const missing = await app.inject({
    method: "POST",
    url: "/api/groups",
    headers: auth(manager.token),
    payload: { name: "Türsüz", visibility: "PUBLIC" },
  });
  expect(missing.statusCode).toBe(400);

  const created = await app.inject({
    method: "POST",
    url: "/api/groups",
    headers: auth(manager.token),
    payload: { name: "Performans Akşam", visibility: "PUBLIC", tennisType: "PERFORMANS" },
  });
  expect(created.statusCode).toBe(201);
  expect(created.json()).toMatchObject({ tennisType: "PERFORMANS", ageGroup: "AGE_18_35" });

  const legacy = await prisma.group.create({
    data: { name: "Eski grup", createdById: manager.user.id },
  });
  expect(legacy.tennisType).toBe("DIGER");
  expect(legacy.ageGroup).toBe("AGE_18_35");

  const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: manager.user.id } });
  expect(profile.tennisType).toBe("DIGER");
  expect(profile.ageGroup).toBe("AGE_18_35");
  expect(profile.personProfile).toBe("OYUNCU");
});

test("a player can be added with a different type and while already in another group", async () => {
  const manager = await registerUser(app, { firstName: "Ekle", lastName: "Sorumlu" });
  const hobby = await registerUser(app, { firstName: "Hobi", lastName: "Oyuncu" });
  const veteran = await registerUser(app, { firstName: "Veteran", lastName: "Oyuncu" });
  await prisma.user.update({ where: { id: manager.user.id }, data: { role: "CLUB_MANAGER" } });
  await prisma.profile.update({ where: { userId: hobby.user.id }, data: { tennisType: "HOBI", ageGroup: "AGE_12_18" } });
  await prisma.profile.update({
    where: { userId: veteran.user.id },
    data: { tennisType: "VETERAN", ageGroup: "OVER_50", personProfile: "ANTRENOR" },
  });

  const performance = await app.inject({
    method: "POST",
    url: "/api/groups",
    headers: auth(manager.token),
    payload: { name: "Performans", tennisType: "PERFORMANS", ageGroup: "AGE_18_35" },
  });
  const other = await app.inject({
    method: "POST",
    url: "/api/groups",
    headers: auth(manager.token),
    payload: { name: "Veteran grubu", tennisType: "VETERAN", ageGroup: "OVER_50" },
  });
  expect(performance.statusCode).toBe(201);
  expect(other.statusCode).toBe(201);
  const performanceId = performance.json().id as string;
  const otherId = other.json().id as string;

  const already = await app.inject({
    method: "POST",
    url: `/api/groups/${otherId}/members`,
    headers: auth(manager.token),
    payload: { userId: veteran.user.id },
  });
  expect(already.statusCode).toBe(201);

  const addedVeteran = await app.inject({
    method: "POST",
    url: `/api/groups/${performanceId}/members`,
    headers: auth(manager.token),
    payload: { userId: veteran.user.id },
  });
  const addedHobby = await app.inject({
    method: "POST",
    url: `/api/groups/${performanceId}/members`,
    headers: auth(manager.token),
    payload: { userId: hobby.user.id },
  });
  expect(addedVeteran.statusCode).toBe(201);
  expect(addedHobby.statusCode).toBe(201);

  const detail = await app.inject({
    method: "GET",
    url: `/api/groups/${performanceId}`,
    headers: auth(manager.token),
  });
  expect(detail.statusCode).toBe(200);
  const members = detail.json().members as { userId: string; tennisType: string }[];
  expect(members.map((member) => member.userId).sort()).toEqual(
    [manager.user.id, hobby.user.id, veteran.user.id].sort(),
  );
  expect(members.find((member) => member.userId === hobby.user.id)?.tennisType).toBe("HOBI");
  expect(members.find((member) => member.userId === veteran.user.id)?.tennisType).toBe("VETERAN");

  const patched = await app.inject({
    method: "PATCH",
    url: `/api/groups/${performanceId}`,
    headers: auth(manager.token),
    payload: { name: "Hobi akşam", tennisType: "HOBI", ageGroup: "AGE_35_50" },
  });
  expect(patched.statusCode).toBe(200);
  expect(patched.json()).toMatchObject({ name: "Hobi akşam", tennisType: "HOBI", ageGroup: "AGE_35_50" });

  const removed = await app.inject({
    method: "DELETE",
    url: `/api/groups/${performanceId}/members/${hobby.user.id}`,
    headers: auth(manager.token),
  });
  expect(removed.statusCode).toBe(200);
  const after = await prisma.groupMember.findFirst({
    where: { groupId: performanceId, userId: hobby.user.id },
  });
  expect(after).toBeNull();
  const stillThere = await prisma.groupMember.findFirst({
    where: { groupId: otherId, userId: veteran.user.id },
  });
  expect(stillThere).toBeTruthy();

  const deleted = await app.inject({
    method: "DELETE",
    url: `/api/groups/${performanceId}`,
    headers: auth(manager.token),
  });
  expect(deleted.statusCode).toBe(200);
  const gone = await prisma.group.findFirst({ where: { id: performanceId, deletedAt: null } });
  expect(gone).toBeNull();
});

test("a player keeps a separate person profile from the tennis type", async () => {
  const player = await registerUser(app, { firstName: "Ayse", lastName: "Kaya" });
  const saved = await app.inject({
    method: "PATCH",
    url: `/api/users/${player.user.id}`,
    headers: auth(player.token),
    payload: { tennisType: "PERFORMANS", ageGroup: "UNDER_12", personProfile: "ANTRENOR" },
  });
  expect(saved.statusCode).toBe(200);
  expect(saved.json().profile).toMatchObject({
    tennisType: "PERFORMANS",
    ageGroup: "UNDER_12",
    personProfile: "ANTRENOR",
  });
});
