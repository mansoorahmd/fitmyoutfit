import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_STOREFRONT_PORT,
  parseStorefrontPort,
} from "../../scripts/storefront-port.mjs"

const storefront = path.resolve(__dirname, "../..")
const wrapper = path.join(storefront, "scripts", "next-with-port.mjs")

describe("STOREFRONT_PORT", () => {
  it("defaults to 8000 when unset or blank", () => {
    expect(DEFAULT_STOREFRONT_PORT).toBe(8000)
    expect(parseStorefrontPort(undefined)).toEqual({ ok: true, port: 8000 })
    expect(parseStorefrontPort("")).toEqual({ ok: true, port: 8000 })
    expect(parseStorefrontPort("  ")).toEqual({ ok: true, port: 8000 })
  })

  it("takes a whole number from 1 to 65535, ignoring surrounding spaces", () => {
    expect(parseStorefrontPort("8006")).toEqual({ ok: true, port: 8006 })
    // cmd's `set STOREFRONT_PORT=8006 && …` keeps the space before &&
    expect(parseStorefrontPort("8006 ")).toEqual({ ok: true, port: 8006 })
    expect(parseStorefrontPort("1")).toEqual({ ok: true, port: 1 })
    expect(parseStorefrontPort("65535")).toEqual({ ok: true, port: 65535 })
  })

  it("refuses anything else, with a message that names the variable and the value", () => {
    for (const bad of ["0", "65536", "-1", "80.5", "8e3", "0x1f40", "abc", "8006abc", "+8006"]) {
      const result = parseStorefrontPort(bad)
      expect(result.ok, bad).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("STOREFRONT_PORT")
        expect(result.error).toContain(`"${bad}"`)
        expect(result.error).toMatch(/1 to 65535/)
      }
    }
  })

  it("is what the dev and start scripts use; dev keeps --turbopack; no port is hard-coded", () => {
    const pkg = JSON.parse(readFileSync(path.join(storefront, "package.json"), "utf8"))
    expect(pkg.scripts.dev).toBe("node scripts/next-with-port.mjs dev --turbopack")
    expect(pkg.scripts.start).toBe("node scripts/next-with-port.mjs start")
    expect(JSON.stringify(pkg.scripts)).not.toMatch(/-p\s*\d|--port/)
  })

  it("the storefront asks for Node 22 or later, as we develop and run CI on", () => {
    const pkg = JSON.parse(readFileSync(path.join(storefront, "package.json"), "utf8"))
    expect(pkg.engines.node).toBe(">=22")
  })

  it(
    "the wrapper stops with the message, before Next.js starts, on an invalid value",
    () => {
      const run = spawnSync(process.execPath, [wrapper, "dev"], {
        env: { ...process.env, STOREFRONT_PORT: "eighty" },
        encoding: "utf8",
        timeout: 30_000,
      })
      expect(run.status).toBe(1)
      expect(run.stderr).toContain('STOREFRONT_PORT must be a whole number from 1 to 65535, but it is "eighty"')
    },
    60_000
  )
})
