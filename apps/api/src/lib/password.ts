import { createRequire } from "node:module";

const argon2 = createRequire(import.meta.url)("argon2") as typeof import("argon2");

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
