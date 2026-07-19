import { defineConfig } from "vitest/config";

// Standalone config so the engine tests run in plain Node without loading the
// CRXJS extension-build plugin from vite.config.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
