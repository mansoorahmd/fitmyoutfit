import react from "@vitejs/plugin-react"
import path from "node:path"
import { defineConfig } from "vitest/config"

const src = path.resolve(import.meta.dirname, "src")

// Tests never talk to a backend: the Medusa SDK or the data layer is mocked
// in each test. Path aliases mirror tsconfig.json (baseUrl ./src).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@lib\//, replacement: `${src}/lib/` },
      { find: /^@modules\//, replacement: `${src}/modules/` },
      { find: /^types\//, replacement: `${src}/types/` },
      { find: /^styles\//, replacement: `${src}/styles/` },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
})
