import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { EDITOR_CSS } from "@fitmyoutfit/editor"

const css = readFileSync(path.resolve(import.meta.dirname, "../styles/globals.css"), "utf8")
const editorSource = readFileSync(path.resolve(import.meta.dirname, "../modules/design/components/design-editor.tsx"), "utf8")

// The store keeps its colours as "r g b" triplets (for Tailwind: rgb(var(--c-x) / alpha)); the editor reads
// them as whole colours. The designer's wrapper turns each one into a whole colour for the editor's own variable.
describe("the editor's colours inside the store", () => {
  const triplets = new Set(Array.from(css.matchAll(/--c-([a-z-]+):\s*(\d+ \d+ \d+);/g)).map((m) => m[1]))
  const host = /\.fmo-host \.fmo-editor \{([^}]*)\}/.exec(css)?.[1] ?? ""

  it("every store colour the editor reads is made whole for it", () => {
    const read = Array.from(EDITOR_CSS.matchAll(/--fmo-([a-z-]+): var\(--c-([a-z-]+)[,)]/g)).map((m) => ({ fmo: m[1], c: m[2] }))
    const triplet = read.filter((r) => triplets.has(r.c))
    expect(triplet.length).toBeGreaterThan(8)
    for (const r of triplet) {
      expect(host, `--fmo-${r.fmo} from --c-${r.c}`).toContain(`--fmo-${r.fmo}: rgb(var(--c-${r.c}));`)
    }
  })

  it("the designer's page carries the wrapper class, and the store's own --c-* are left alone", () => {
    expect(editorSource).toContain("fmo-host fixed inset-0")
    expect(host).not.toMatch(/--c-[a-z-]+:/)
  })
})
