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

test("members cannot administer users, roles, or announcements", async () => {
  const member = await registerUser(app);
  const list = await app.inject({ method: "GET", url: "/api/users", headers: auth(member.token) });
  expect(list.statusCode).toBe(403);

  const role = await app.inject({
    method: "PATCH",
    url: `/api/users/${member.user.id}/role`,
    headers: auth(member.token),
    payload: { role: "ADMIN" },
  });
  expect(role.statusCode).toBe(403);

  const announcement = await app.inject({
    method: "POST",
    url: "/api/announcements",
    headers: auth(member.token),
    payload: { title: "Deneme duyurusu", body: "Bu görünmemeli." },
  });
  expect(announcement.statusCode).toBe(403);

  const tournament = await app.inject({
    method: "POST",
    url: "/api/tournaments",
    headers: auth(member.token),
    payload: { name: "Üye kupası", startDate: "2026-10-01" },
  });
  expect(tournament.statusCode).toBe(403);
});

test("admin role changes are audited and tournament managers can create tournaments", async () => {
  const admin = await registerUser(app, { firstName: "Admin", lastName: "Deneme" });
  const member = await registerUser(app, { firstName: "Uye", lastName: "Deneme" });
  const tournamentManager = await registerUser(app, { firstName: "Turnuva", lastName: "Deneme" });
  await prisma.user.update({ where: { id: admin.user.id }, data: { role: "ADMIN" } });
  await prisma.user.update({ where: { id: tournamentManager.user.id }, data: { role: "TOURNAMENT_MANAGER" } });

  const changed = await app.inject({
    method: "PATCH",
    url: `/api/users/${member.user.id}/role`,
    headers: auth(admin.token),
    payload: { role: "CLUB_MANAGER" },
  });
  expect(changed.statusCode).toBe(200);
  const audit = await prisma.auditLog.findFirst({
    where: { action: "ROLE_CHANGE", entityId: member.user.id },
  });
  expect(audit).toBeTruthy();

  const created = await app.inject({
    method: "POST",
    url: "/api/tournaments",
    headers: auth(tournamentManager.token),
    payload: { name: "Sonbahar Kupası", startDate: "2026-10-20", status: "REGISTRATION_OPEN" },
  });
  expect(created.statusCode).toBe(201);

  const note = await app.inject({
    method: "POST",
    url: "/api/announcements",
    headers: auth(member.token),
    payload: { title: "Kulüp notu", body: "Akşam kortu açık." },
  });
  expect(note.statusCode).toBe(201);
});

test("a group manager cannot edit a group they do not manage", async () => {
  const owner = await registerUser(app, { firstName: "Sahip", lastName: "Grup" });
  const outsider = await registerUser(app, { firstName: "Dis", lastName: "Yonetici" });
  await prisma.user.update({ where: { id: owner.user.id }, data: { role: "CLUB_MANAGER" } });
  await prisma.user.update({ where: { id: outsider.user.id }, data: { role: "GROUP_MANAGER" } });
  const created = await app.inject({
    method: "POST",
    url: "/api/groups",
    headers: auth(owner.token),
    payload: { name: "Akşam Grubu", visibility: "PUBLIC", tennisType: "HOBI" },
  });
  expect(created.statusCode).toBe(201);
  const patched = await app.inject({
    method: "PATCH",
    url: `/api/groups/${created.json().id}`,
    headers: auth(outsider.token),
    payload: { name: "Ele geçirildi" },
  });
  expect(patched.statusCode).toBe(403);
});

test("soft-deleted users lose access immediately", async () => {
  const admin = await registerUser(app);
  const member = await registerUser(app);
  await prisma.user.update({ where: { id: admin.user.id }, data: { role: "ADMIN" } });
  const removed = await app.inject({
    method: "DELETE",
    url: `/api/users/${member.user.id}`,
    headers: auth(admin.token),
  });
  expect(removed.statusCode).toBe(200);
  const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: auth(member.token) });
  expect(me.statusCode).toBe(401);
});
