import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import "./env";

export default function setup(): void {
  execSync("pnpm exec prisma migrate deploy", {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit",
    env: process.env,
  });
}
