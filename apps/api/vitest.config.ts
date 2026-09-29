import { defineConfig } from "vitest/config";

const testUrl = process.env.TEST_DATABASE_URL ?? "postgresql://tennis:tennis@localhost:5432/tennisclub_test";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 30000,
    globalSetup: "./test/global-setup.ts",
    setupFiles: ["./test/env.ts", "./test/setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testUrl,
      TEST_DATABASE_URL: testUrl,
      ACCESS_TOKEN_SECRET: "test-access-secret-which-is-long-enough",
      WEB_ORIGIN: "http://localhost:43123",
      API_PUBLIC_URL: "http://127.0.0.1:43124",
    },
  },
});
