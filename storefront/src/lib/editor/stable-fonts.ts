// The designer's lettering faces under names that do not change.
//
// next/font self-hosts each face and gives it a generated family name ("__Oswald_a1b2c3") that changes with every build
// of the storefront. A design saved with such a name (on a device, or as a team order's design version) would name a face
// that no longer exists after the next build. So the designer gives the editor the catalogue's own family names
// ("Oswald"): for each face it registers, with the browser's FontFace API, an alias under the stable name that uses the
// very same font files next/font loads (read from next/font's own @font-face rules). A design saved from then on names
// "Oswald". Designs saved before this change still name generated families: `lib/editor/proof-fonts.ts` turns those
// back into the catalogue's family and then into this build's face, and it does the same for stable names (the roster
// proof's pictures use this build's faces). Plain functions with their dependencies passed in, tested on their own
// (stable-fonts.test.ts).

/** The pieces of the browser this needs, so a test can give it fakes. */
export type FontEnvironment = {
  /** The page's style sheets (their rules are read; a sheet that cannot be read is skipped). */
  styleSheets: ArrayLike<{ cssRules?: ArrayLike<unknown>; href?: string | null }>
  /** The page's own address (`document.baseURI`): the base for a sheet with no address of its own (an inline one). */
  baseURI?: string
  /** `document.fonts`: where an alias is added. */
  fonts: { add(face: unknown): unknown }
  /** The FontFace constructor. */
  FontFace: new (family: string, source: string, descriptors?: Record<string, string>) => unknown
}

type FontFaceRuleLike = {
  style: { getPropertyValue(name: string): string }
}

const unquote = (name: string): string => name.trim().replace(/^['"]|['"]$/g, "")
const isFontFaceRule = (rule: unknown): rule is FontFaceRuleLike => {
  const candidate = rule as { type?: number; style?: { getPropertyValue?: unknown } }
  return candidate?.type === 5 && typeof candidate.style?.getPropertyValue === "function"
}

const ADDRESS = new RegExp("url[(][ ]*(['\"]?)([^'\")]+)['\"]?[ ]*[)]", "g")

/**
 * A rule's `src` with every `url(...)` made absolute against the address of the style sheet the rule came from.
 * In a style sheet a relative address is relative to the sheet (`../media/x.woff2` from `/_next/static/chunks/a.css`);
 * a FontFace made by script resolves it against the page instead (`/pk/media/x.woff2`: not found, and the lettering
 * falls back to another face). Without a base, or for an address that cannot be read, the text is kept.
 */
export function absoluteSource(source: string, base: string | null | undefined): string {
  if (!base) return source
  return source.replace(ADDRESS, (whole: string, _quote: string, address: string) => {
    try {
      return `url("${new URL(address, base).href}")`
    } catch {
      return whole
    }
  })
}

const DESCRIPTORS = [
  ["font-weight", "weight"],
  ["font-style", "style"],
  ["unicode-range", "unicodeRange"],
  ["font-display", "display"],
] as const

/**
 * Registers an alias for each generated family under its stable name, and returns the family map the designer gives
 * the editor's catalogue: the stable name for every face whose alias was registered, the generated name for one whose
 * @font-face rule could not be found (it then works as before, and its design is remapped by proof-fonts).
 * `generated` is the catalogue's family to the generated one (lib/editor/fonts.ts).
 */
export function registerStableFamilies(generated: Readonly<Record<string, string>>, env: FontEnvironment | null): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [stable, generatedName] of Object.entries(generated)) {
    let registered = 0
    if (env) {
      try {
        for (const sheet of Array.from(env.styleSheets)) {
          let rules: unknown[] = []
          try {
            rules = Array.from(sheet.cssRules ?? [])
          } catch {
            continue // a sheet from another origin cannot be read
          }
          const base = sheet.href || env.baseURI || null
          for (const rule of rules) {
            if (!isFontFaceRule(rule) || unquote(rule.style.getPropertyValue("font-family")) !== generatedName) continue
            const source = absoluteSource(rule.style.getPropertyValue("src"), base)
            if (!source) continue
            const descriptors: Record<string, string> = {}
            for (const [property, key] of DESCRIPTORS) {
              const value = rule.style.getPropertyValue(property)
              if (value) descriptors[key] = value
            }
            env.fonts.add(new env.FontFace(stable, source, descriptors))
            registered++
          }
        }
      } catch {
        registered = 0
      }
    }
    result[stable] = registered > 0 ? stable : generatedName
  }
  return result
}

/** The browser's pieces, or null where there is no document (the server, a test without one). */
export function browserFontEnvironment(): FontEnvironment | null {
  if (typeof document === "undefined" || typeof FontFace === "undefined" || !document.fonts) return null
  return { styleSheets: document.styleSheets, fonts: document.fonts, FontFace, baseURI: document.baseURI }
}

let once: { key: string; families: Record<string, string> } | null = null

/**
 * `registerStableFamilies` for the browser, once for each set of generated names (the designer may open again in the same
 * page without a reload: the aliases are added once). Without a browser the generated names stay.
 */
export function stableFamilies(generated: Readonly<Record<string, string>>): Record<string, string> {
  const env = browserFontEnvironment()
  if (!env) return { ...generated }
  const key = JSON.stringify(generated)
  if (once?.key !== key) once = { key, families: registerStableFamilies(generated, env) }
  return once.families
}
