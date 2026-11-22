// A saved design names its fonts by family. In the designer the catalogue's families are renamed to the faces
// next/font generated ("__Oswald_a1b2c3", see lib/editor/fonts.ts and the designer's loader), and the design is
// saved with those names. The generated names change with a build, so a design saved before the last build names
// a face that no longer exists. Before the proof's pictures are drawn, every font family of the design is turned
// back to the catalogue's family and then to the face this build has: the same font, found by its name.
// Plain functions, tested on their own (proof-fonts.test.ts).

/** A generated family ("__Noto_Sans_Arabic_1a2b3c") as the catalogue names it ("Noto Sans Arabic"); other names as they are. */
export function catalogueFamily(family: string): string {
  const match = /^__(.+)_[0-9a-f]{5,}$/i.exec(family.trim().replace(/^["']|["']$/g, ""))
  return match ? match[1]!.replace(/_/g, " ") : family
}

/**
 * The face of this build for a design's font family: the family itself when this build has it, else the one
 * generated for the same catalogue family, else the family unchanged (the browser then falls back, and the
 * pictures say they could not be drawn if the font does not load).
 */
export function currentFamily(family: string, generated: Readonly<Record<string, string>>): string {
  if (Object.values(generated).includes(family)) return family
  const base = catalogueFamily(family)
  return generated[base] ?? family
}

/** The design with every font's family turned to this build's face. Everything else is the design as it was. */
export function withCurrentFonts<T extends { fonts?: unknown }>(design: T, generated: Readonly<Record<string, string>>): T {
  if (!Array.isArray(design.fonts)) return design
  return {
    ...design,
    fonts: design.fonts.map((font) =>
      typeof font === "object" && font !== null && typeof (font as { family?: unknown }).family === "string"
        ? { ...font, family: currentFamily((font as { family: string }).family, generated) }
        : font
    ),
  }
}
