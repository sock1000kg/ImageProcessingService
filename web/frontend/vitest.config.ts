import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["frontend/tests/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
