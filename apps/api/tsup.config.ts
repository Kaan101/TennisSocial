import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  external: ["@prisma/client", "argon2"],
  noExternal: ["@club/shared", "@club/types"],
});