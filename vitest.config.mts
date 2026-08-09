import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests only — pure logic, no Firestore. Anything needing the Admin SDK is
// verified in production instead, per this project's workflow.

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
