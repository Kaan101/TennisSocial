import type { FastifyInstance } from "fastify";
import { createApp } from "../src/app";

export async function makeApp(): Promise<FastifyInstance> {
  const app = await createApp({ logger: false });
  await app.ready();
  return app;
}

export async function registerUser(
  app: FastifyInstance,
  input?: Partial<{ email: string; firstName: string; lastName: string; password: string }>,
) {
  const email = input?.email ?? `u-${Math.random().toString(16).slice(2)}@tennisclub.test`;
  const password = input?.password ?? "Demo1234!";
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email,
      password,
      firstName: input?.firstName ?? "Test",
      lastName: input?.lastName ?? "Oyuncu",
    },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  const body = res.json();
  return {
    email,
    password,
    token: body.tokens.accessToken as string,
    refresh: body.tokens.refreshToken as string,
    user: body.user as { id: string; email: string; role: string; firstName: string; lastName: string },
  };
}

export function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
