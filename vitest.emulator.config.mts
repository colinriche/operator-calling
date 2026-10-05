import { defineConfig } from "vitest/config";
import path from "node:path";

// Runs the server-side moderation code against the Firestore EMULATOR: the
// transactions, Timestamps and arrayUnion writes that unit tests cannot reach.
// `npm run test:emulator` starts the emulator and runs this. Not part of
// `npm test`, which stays Firestore-free.

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/emulator/**/*.emulator.ts"],
    testTimeout: 20000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
