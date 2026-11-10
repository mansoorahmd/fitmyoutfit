/**
 * The first family in a CSS font-family list: "'Inter', 'Inter Fallback'"
 * gives "'Inter'". next/font names the real font first and its
 * metric-matched fallback (a local Arial) second.
 */
export const primaryFamily = (fontFamily: string): string =>
  fontFamily.split(",")[0]?.trim() ?? ""

/**
 * CSS variables that hold only the real font faces, without next/font's
 * fallbacks. The Tailwind font stacks put these first:
 *
 *   Inter, Noto Sans Arabic, Inter Fallback (Arial), system fonts
 *
 * If the fallback came before Noto Sans Arabic, Arabic and Urdu letters
 * would render in Arial, which has Arabic glyphs. Latin text never reaches
 * Noto Sans Arabic because Inter (or Barlow Condensed) covers it first.
 */
export const fontFaceVariables = (fonts: {
  heading: string
  body: string
  arabic: string
}): Record<string, string> => ({
  "--font-heading-face": primaryFamily(fonts.heading),
  "--font-body-face": primaryFamily(fonts.body),
  "--font-arabic-face": primaryFamily(fonts.arabic),
})
