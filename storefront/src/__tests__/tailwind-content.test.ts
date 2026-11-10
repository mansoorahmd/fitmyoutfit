import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"

// tailwind.config.js and its helper are plain CommonJS that Tailwind loads
// with Node's require, so the test loads them the same way.
const require = createRequire(import.meta.url)
const storefrontDir = path.resolve(__dirname, "..", "..")
const config = require(path.join(storefrontDir, "tailwind.config.js"))
const { resolvePackageDir, toGlob, packageContentGlob } = require(
  path.join(storefrontDir, "tailwind.paths.js")
)

/** The folder part of a glob, before the first wildcard segment. */
const globBase = (glob: string) =>
  glob
    .split("/")
    .filter((_, i, parts) => !parts.slice(0, i + 1).some((p) => /[*{]/.test(p)))
    .join("/")

describe("Tailwind content paths", () => {
  it("includes Medusa UI's built files at the folder Node resolves, which exists", () => {
    const uiDir = resolvePackageDir("@medusajs/ui", storefrontDir)
    const expected = toGlob(uiDir, "dist/**/*.{js,ts,jsx,tsx}")

    expect(config.content).toContain(expected)
    expect(fs.existsSync(path.join(uiDir, "dist"))).toBe(true)
    expect(
      JSON.parse(fs.readFileSync(path.join(uiDir, "package.json"), "utf8")).name
    ).toBe("@medusajs/ui")
  })

  it("has no path that assumes a node_modules folder next to the config", () => {
    for (const entry of config.content as string[]) {
      expect(entry.startsWith("./node_modules")).toBe(false)
      expect(entry.startsWith("node_modules")).toBe(false)
    }
  })

  it("uses absolute paths with forward slashes, each with an existing base folder (except optional src folders)", () => {
    const optional = new Set(["pages", "components"])
    for (const entry of config.content as string[]) {
      expect(path.isAbsolute(entry)).toBe(true)
      expect(entry).not.toContain("\\")
      const base = globBase(entry)
      if (!optional.has(path.basename(base))) {
        expect(fs.existsSync(base)).toBe(true)
      }
    }
  })

  it("resolves the Medusa UI preset from the storefront", () => {
    expect(() =>
      require.resolve("@medusajs/ui-preset", { paths: [storefrontDir] })
    ).not.toThrow()
    expect(config.presets).toHaveLength(1)
  })
})

describe("resolvePackageDir finds a package hoisted to a parent node_modules", () => {
  // root/node_modules/@scope/hoisted is installed; root/app has no node_modules,
  // like the storefront in the monorepo's combined install.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fmo-hoist-"))
  const app = path.join(root, "app")
  const pkg = path.join(root, "node_modules", "@scope", "hoisted")

  fs.mkdirSync(app, { recursive: true })
  fs.mkdirSync(path.join(pkg, "dist", "cjs"), { recursive: true })
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "@scope/hoisted",
      // like @medusajs/ui: package.json is not exported
      exports: { ".": { require: "./dist/cjs/index.js" } },
    })
  )
  // a nested manifest without the name must not be taken for the package root
  fs.writeFileSync(
    path.join(pkg, "dist", "cjs", "package.json"),
    JSON.stringify({ type: "commonjs" })
  )
  fs.writeFileSync(path.join(pkg, "dist", "cjs", "index.js"), "module.exports = 1")

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it("returns the hoisted package folder", () => {
    expect(fs.realpathSync(resolvePackageDir("@scope/hoisted", app))).toBe(
      fs.realpathSync(pkg)
    )
  })

  it("builds a forward-slash glob into the hoisted folder", () => {
    const glob = packageContentGlob("@scope/hoisted", app, "dist/**/*.js")
    expect(glob).not.toContain("\\")
    expect(glob.endsWith("/node_modules/@scope/hoisted/dist/**/*.js")).toBe(true)
  })

  it("throws a clear error for a package that is not installed", () => {
    expect(() => resolvePackageDir("@scope/missing", app)).toThrow()
  })
})
