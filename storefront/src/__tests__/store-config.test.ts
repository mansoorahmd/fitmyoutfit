import { afterEach, describe, expect, it, vi } from "vitest"

async function loadStoreName() {
  vi.resetModules()
  return (await import("@lib/store-config")).STORE_NAME
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("store name config", () => {
  it("defaults to FitMyOutfit when NEXT_PUBLIC_STORE_NAME is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "x")
    delete process.env.NEXT_PUBLIC_STORE_NAME

    expect(await loadStoreName()).toBe("FitMyOutfit")
  })

  it("defaults to FitMyOutfit when the variable is empty or blank", async () => {
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "  ")

    expect(await loadStoreName()).toBe("FitMyOutfit")
  })

  it("reads the name from NEXT_PUBLIC_STORE_NAME", async () => {
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "Test Club Kits")

    expect(await loadStoreName()).toBe("Test Club Kits")
  })
})
