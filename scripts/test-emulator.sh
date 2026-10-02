#!/bin/sh
# Runs the emulator-backed tests. firebase-tools' emulators:exec puts its own
# bundled node first on PATH, which cannot run vitest (ERR_REQUIRE_ESM), so the
# real node is captured here and called by absolute path.
cd "$(dirname "$0")/.." || exit 1
NODE_BIN="$(command -v node)" export NODE_BIN
exec firebase emulators:exec --config firebase.emulator.json --only firestore \
  --project demo-moderation \
  "\"$NODE_BIN\" node_modules/vitest/vitest.mjs run --config vitest.emulator.config.mts"
