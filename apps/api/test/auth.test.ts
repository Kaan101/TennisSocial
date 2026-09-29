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

test("register, login, me, and logout", async () => {
  const created = await registerUser(app, { email: "ayse@tennisclub.test", firstName: "Ayşe", lastName: "Kaya" });
  expect(created.user.role).toBe("MEMBER");

  const duplicate = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email: "ayse@tennisclub.test", password: "Demo1234!", firstName: "Ayşe", lastName: "Kaya" },
  });
  expect(duplicate.statusCode).toBe(409);

  const bad = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "ayse@tennisclub.test", password: "wrong-pass-1" },
  });
  expect(bad.statusCode).toBe(401);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "ayse@tennisclub.test", password: "Demo1234!" },
  });
  expect(login.statusCode).toBe(200);
  const session = login.json();

  const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: auth(session.tokens.accessToken) });
  expect(me.statusCode).toBe(200);
  expect(me.json().user.email).toBe("ayse@tennisclub.test");

  const anon = await app.inject({ method: "GET", url: "/api/auth/me" });
  expect(anon.statusCode).toBe(401);

  const logout = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    payload: { refreshToken: session.tokens.refreshToken },
  });
  expect(logout.statusCode).toBe(200);
});

test("refresh rotates and reuse revokes the family", async () => {
  const created = await registerUser(app);
  const first = await app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    payload: { refreshToken: created.refresh },
  });
  expect(first.statusCode).toBe(200);
  const rotated = first.json();
  expect(rotated.tokens.refreshToken).not.toBe(created.refresh);

  const reuse = await app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    payload: { refreshToken: created.refresh },
  });
  expect(reuse.statusCode).toBe(401);

  const afterReuse = await app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    payload: { refreshToken: rotated.tokens.refreshToken },
  });
  expect(afterReuse.statusCode).toBe(401);
});

test("password reset is a stub and forgot does not leak accounts", async () => {
  const forgot = await app.inject({
    method: "POST",
    url: "/api/auth/forgot-password",
    payload: { email: "missing@tennisclub.test" },
  });
  expect(forgot.statusCode).toBe(200);
  const reset = await app.inject({
    method: "POST",
    url: "/api/auth/reset-password",
    payload: { token: "nope", password: "Demo1234!" },
  });
  expect(reset.statusCode).toBe(501);
});
