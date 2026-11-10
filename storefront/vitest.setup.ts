import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// `server-only` throws when imported outside a React Server Components build.
vi.mock("server-only", () => ({}))

afterEach(() => {
  cleanup()
})
