import type { AuthUser } from "./lib/authz";

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
}
