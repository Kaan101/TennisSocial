
import { createRequire } from "node:module";

const { PrismaClient } = createRequire(import.meta.url)("@prisma/client") as {
  PrismaClient: typeof import("@prisma/client").PrismaClient;
};

export const prisma = new PrismaClient();