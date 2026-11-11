import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// Next.js stays on major 15 with the security fixes (S0-17): next and
// eslint-config-next pinned to the same exact version, React unchanged.
const storefront = path.resolve(__dirname, "../..")
const pkg = JSON.parse(readFileSync(path.join(storefront, "package.json"), "utf8"))

const parse = (version: string) => version.split(".").map(Number)

describe("Next.js version", () => {
  it("next and eslint-config-next are pinned to the same exact 15.x version", () => {
    const next = pkg.dependencies.next as string
    expect(next).toMatch(/^15\.\d+\.\d+$/)
    expect(pkg.devDependencies["eslint-config-next"]).toBe(next)
  })

  it("is at least 15.5.29, the release with the image optimization fixes", () => {
    const [major, minor, patch] = parse(pkg.dependencies.next)
    expect(major).toBe(15)
    expect(minor * 1000 + patch).toBeGreaterThanOrEqual(5 * 1000 + 29)
  })

  it("leaves React where it was", () => {
    expect(pkg.dependencies.react).toBe("19.3.1")
    expect(pkg.dependencies["react-dom"]).toBe("19.3.1")
  })
})
