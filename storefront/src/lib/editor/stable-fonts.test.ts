import { describe, expect, it } from "vitest"

import { currentFamily, withCurrentFonts } from "./proof-fonts"
import { registerStableFamilies, type FontEnvironment } from "./stable-fonts"

/** A page as one build of the storefront leaves it: next/font's @font-face rules under that build's generated names. */
function build(suffix: string) {
  const generated = { Oswald: `__Oswald_${suffix}`, Graduate: `__Graduate_${suffix}` }
  const rule = (family: string, file: string) => ({
    type: 5,
    style: { getPropertyValue: (name: string) => ({ "font-family": `'${family}'`, src: `url(/_next/static/media/${file}.woff2) format('woff2')`, "font-weight": "700", "unicode-range": "U+0000-00FF" })[name] ?? "" },
  })
  const added: { family: string; source: string; descriptors?: Record<string, string> }[] = []
  const env: FontEnvironment = {
    styleSheets: [{ cssRules: [rule(generated.Oswald, `oswald-${suffix}`), rule(generated.Graduate, `graduate-${suffix}`), rule("__Other_x", "other")] }],
    fonts: { add: (face) => added.push(face as never) },
    FontFace: class {
      constructor(
        public family: string,
        public source: string,
        public descriptors?: Record<string, string>
      ) {}
    } as never,
  }
  return { generated, env, added }
}

describe("stable font family names", () => {
  it("the editor gets the catalogue's own names, the same after every build", () => {
    const first = build("a1b2c3")
    const second = build("d4e5f6")
    const a = registerStableFamilies(first.generated, first.env)
    const b = registerStableFamilies(second.generated, second.env)
    expect(a).toEqual({ Oswald: "Oswald", Graduate: "Graduate" })
    expect(b).toEqual(a)
    // nothing generated reaches the editor, so nothing generated is saved in a design
    expect(JSON.stringify(a)).not.toMatch(/__/)
  })

  it("each stable name is an alias of the very files next/font loads (its source and descriptors)", () => {
    const { generated, env, added } = build("a1b2c3")
    registerStableFamilies(generated, env)
    expect(added.map((f) => f.family)).toEqual(["Oswald", "Graduate"])
    expect(added[0]!.source).toContain("oswald-a1b2c3.woff2")
    expect(added[0]!.descriptors).toEqual({ weight: "700", unicodeRange: "U+0000-00FF" })
  })

  it("a face whose rule is not found keeps its generated name (it works as before; the remap handles its designs)", () => {
    const { generated, env } = build("a1b2c3")
    expect(registerStableFamilies({ ...generated, Missing: "__Missing_zzzzzz" }, env)).toEqual({ Oswald: "Oswald", Graduate: "Graduate", Missing: "__Missing_zzzzzz" })
    expect(registerStableFamilies(generated, null)).toEqual(generated)
  })

  it("a sheet that cannot be read is skipped", () => {
    const { generated, env } = build("a1b2c3")
    const blocked = {
      get cssRules(): never {
        throw new Error("SecurityError")
      },
    }
    expect(registerStableFamilies(generated, { ...env, styleSheets: [blocked, ...Array.from(env.styleSheets)] })).toEqual({ Oswald: "Oswald", Graduate: "Graduate" })
  })

  it("a design saved with stable names opens with its fonts after a new build; one saved with a generated name still does", () => {
    const next = build("d4e5f6").generated
    const stable = { fonts: [{ family: "Oswald" }, { family: "Graduate" }], other: 1 }
    // the proof's pictures use this build's faces: the stable name is turned into this build's
    expect(withCurrentFonts(stable, next)).toEqual({ fonts: [{ family: "__Oswald_d4e5f6" }, { family: "__Graduate_d4e5f6" }], other: 1 })
    // a design saved by an older build of the storefront names a generated family that is gone
    expect(currentFamily("__Oswald_a1b2c3", next)).toBe("__Oswald_d4e5f6")
    expect(withCurrentFonts({ fonts: [{ family: "__Graduate_a1b2c3" }] }, next).fonts[0]).toEqual({ family: "__Graduate_d4e5f6" })
  })
})
