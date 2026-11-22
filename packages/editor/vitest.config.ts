import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Heavy tests (model decoding, big rasters, the print-area search) pass alone in seconds but
    // went over the 5 s default on a busy machine. Generous limits; no assertion is weakened.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // scripts/: the plain functions behind the model processing script (model-prep/).
    // demo/: the demo's data (which products it shows, and their models' credits).
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts", "demo/**/*.test.ts"],
  },
});
