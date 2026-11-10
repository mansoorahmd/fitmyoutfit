import { afterEach, describe, expect, it, vi } from "vitest"

import { heroImageFor } from "@content/home"

// The stand-in hero photo is from another store's site and its host is
// allowed by next.config.js in non-production builds only. The content file
// itself must drop it in production, so a production build shows the navy
// hero and can never fail on the image host.
describe("hero image is development-only", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("is null in a production build", () => {
    expect(heroImageFor("production")).toBeNull()
  })

  it("is the stand-in in development and test runs", () => {
    for (const env of ["development", "test", undefined]) {
      expect(heroImageFor(env)?.src).toMatch(/^https:\/\/www\.spized\.com\/thumbnail\//)
    }
  })

  it("homeContent.heroImage is null when NODE_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.resetModules()

    const { homeContent } = await import("@content/home")

    expect(homeContent.heroImage).toBeNull()
  })

  it("homeContent.heroImage is the stand-in outside production", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.resetModules()

    const { homeContent } = await import("@content/home")

    expect(homeContent.heroImage?.alt).toBe("A player wearing a custom team jersey")
  })
})
