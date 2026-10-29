import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["backend/tests/service/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
  },
});
