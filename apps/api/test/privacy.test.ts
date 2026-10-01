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

test("hidden phone stays hidden, friends can see a friends-only number, admin overrides are audited", async () => {
  const owner = await registerUser(app, { firstName: "Gizli", lastName: "Hat" });
  const other = await registerUser(app, { firstName: "Baska", lastName: "Uye" });
  const admin = await registerUser(app, { firstName: "Yonetici", lastName: "Kulup" });
  await prisma.user.update({ where: { id: admin.user.id }, data: { role: "ADMIN" } });

  await app.inject({
    method: "PATCH",
    url: `/api/users/${owner.user.id}`,
    headers: auth(owner.token),
    payload: { phone: "+905551112233", whatsapp: "+905551112233", address: "Gizli Sokak 1" },
  });
  await app.inject({
    method: "PUT",
    url: `/api/users/${owner.user.id}/privacy`,
    headers: auth(owner.token),
    payload: { phoneVisibility: "HIDDEN", whatsappVisibility: "FRIENDS", addressVisibility: "HIDDEN" },
  });

  const hidden = await app.inject({ method: "GET", url: `/api/users/${owner.user.id}`, headers: auth(other.token) });
  expect(hidden.statusCode).toBe(200);
  expect(hidden.json().profile.phone).toBeNull();
  expect(hidden.json().profile.whatsapp).toBeNull();
  expect(hidden.json().profile.address).toBeNull();
  expect(hidden.json().permissions.canCall).toBe(false);
  expect(hidden.json().permissions.canWhatsapp).toBe(false);

  const request = await app.inject({
    method: "POST",
    url: "/api/friends",
    headers: auth(other.token),
    payload: { userId: owner.user.id },
  });
  expect(request.statusCode).toBe(201);
  const accepted = await app.inject({
    method: "POST",
    url: `/api/friends/${request.json().id}/accept`,
    headers: auth(owner.token),
  });
  expect(accepted.statusCode).toBe(200);

  const asFriend = await app.inject({ method: "GET", url: `/api/users/${owner.user.id}`, headers: auth(other.token) });
  expect(asFriend.json().profile.phone).toBeNull();
  expect(asFriend.json().profile.whatsapp).toBe("905551112233");
  expect(asFriend.json().permissions.canWhatsapp).toBe(true);
  expect(asFriend.json().profile.address).toBeNull();

  const asAdmin = await app.inject({ method: "GET", url: `/api/users/${owner.user.id}`, headers: auth(admin.token) });
  expect(asAdmin.json().profile.phone).toBe("905551112233");
  expect(asAdmin.json().profile.address).toBe("Gizli Sokak 1");
  const audit = await prisma.auditLog.findFirst({
    where: { action: "PRIVACY_OVERRIDE_READ", entityId: owner.user.id, actorId: admin.user.id },
  });
  expect(audit).toBeTruthy();
});

test("saved Turkish numbers become 90 plus the last ten digits", async () => {
  const owner = await registerUser(app, { firstName: "Hat", lastName: "Norm" });
  const samples = ["+90 532 111 22 33", "05321112233", "5321112233", "905321112233", "532-111-22-33"];
  for (const sample of samples) {
    const saved = await app.inject({
      method: "PATCH",
      url: `/api/users/${owner.user.id}`,
      headers: auth(owner.token),
      payload: { phone: sample, whatsapp: sample },
    });
    expect(saved.statusCode).toBe(200);
    const profile = await prisma.profile.findUnique({ where: { userId: owner.user.id } });
    expect(profile?.phone).toBe("905321112233");
    expect(profile?.whatsapp).toBe("905321112233");
  }
  const short = await app.inject({
    method: "PATCH",
    url: `/api/users/${owner.user.id}`,
    headers: auth(owner.token),
    payload: { phone: "53211", whatsapp: "12 34" },
  });
  expect(short.statusCode).toBe(200);
  const kept = await prisma.profile.findUnique({ where: { userId: owner.user.id } });
  expect(kept?.phone).toBe("53211");
  expect(kept?.whatsapp).toBe("12 34");
});

test("district stays visible when the street address is hidden", async () => {
  const owner = await registerUser(app, { firstName: "Semt", lastName: "Gorunur" });
  const other = await registerUser(app);
  await app.inject({
    method: "PATCH",
    url: `/api/users/${owner.user.id}`,
    headers: auth(owner.token),
    payload: { district: "Kadıköy", city: "İstanbul", address: "Moda Cad. 5" },
  });
  const view = await app.inject({ method: "GET", url: `/api/users/${owner.user.id}`, headers: auth(other.token) });
  expect(view.json().profile.district).toBe("Kadıköy");
  expect(view.json().profile.city).toBe("İstanbul");
  expect(view.json().profile.address).toBeNull();
});
