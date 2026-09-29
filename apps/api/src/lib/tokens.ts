import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config";

const secret = () => new TextEncoder().encode(config.accessSecret);

export type AccessPayload = {
  sub: string;
  email: string;
  role: string;
};

export async function signAccessToken(user: { id: string; email: string; role: string }): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<AccessPayload> {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
  if (payload.typ !== "access" || !payload.sub || typeof payload.email !== "string" || typeof payload.role !== "string") {
    throw new Error("Invalid access token");
  }
  return { sub: payload.sub, email: payload.email, role: payload.role };
}

export function newRefreshToken(): { token: string; tokenHash: string; familyId: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashRefreshToken(token), familyId: randomUUID() };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const ACCESS_TTL_SECONDS = 60 * 15;
export const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30;
