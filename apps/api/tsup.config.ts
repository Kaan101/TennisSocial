import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node22",
  outDir: "dist",
  clean: true,
  splitting: false,
  external: ["@prisma/client", "argon2"],
  noExternal: ["@club/shared", "@club/types"],
  outExtension() {
    return { js: ".cjs" };
  },
});