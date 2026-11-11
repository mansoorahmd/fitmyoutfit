import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // scripts/: the plain functions behind the model processing script (model-prep/).
    // demo/: the demo's data (which products it shows, and their models' credits).
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts", "demo/**/*.test.ts"],
  },
});
