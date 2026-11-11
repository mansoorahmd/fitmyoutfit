import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // scripts/: the plain functions behind the model processing script (model-prep/).
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
  },
});
