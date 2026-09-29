import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../.env") });

function requiredInProduction(name: string, fallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required in production`);
  }
  return fallback;
}

const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:43123";

export const config = {
  port: Number(process.env.PORT ?? 43124),
  nodeEnv: process.env.NODE_ENV ?? "development",
  webOrigins: webOrigin.split(",").map((item) => item.trim()).filter(Boolean),
  accessSecret: requiredInProduction(
    "ACCESS_TOKEN_SECRET",
    "dev-only-access-secret-change-me",
  ),
  cookieSecure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
  cookieSameSite: (process.env.COOKIE_SAMESITE ?? "lax") as "lax" | "none" | "strict",
  apiPublicUrl: process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 43124}`,
  uploadDir: process.env.UPLOAD_DIR
    ? resolve(process.env.UPLOAD_DIR)
    : resolve(here, "../uploads"),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  },
};

export function cloudinaryEnabled(): boolean {
  const c = config.cloudinary;
  return Boolean(c.cloudName && c.apiKey && c.apiSecret);
}
