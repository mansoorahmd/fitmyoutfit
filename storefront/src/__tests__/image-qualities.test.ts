import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { describe, expect, it } from "vitest"

// Next 16 only serves image qualities listed in `images.qualities`. Every
// `quality={N}` in the code must be in the list, and so must the default 75.
const storefront = path.resolve(__dirname, "../..")
const src = path.join(storefront, "src")

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(full)
    }
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : []
  })

const loadConfig = () => {
  // next.config.js checks this variable on load and exits without it.
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||= "pk_test"
  const require = createRequire(import.meta.url)
  return require(path.join(storefront, "next.config.js"))
}

describe("images.qualities", () => {
  it("lists every quality the code uses, and the default 75", () => {
    const used: number[] = [75]
    for (const file of sourceFiles(src)) {
      const text = fs.readFileSync(file, "utf8")
      const pattern = /quality=\{(\d+)\}/g
      let match: RegExpExecArray | null
      while ((match = pattern.exec(text))) {
        used.push(Number(match[1]))
      }
    }

    expect(used).toContain(50)
    const qualities: number[] = loadConfig().images.qualities
    used.forEach((value) => expect(qualities).toContain(value))
  }, 30_000) // reads every source file; slow on a busy disk
})
