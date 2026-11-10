import { Barlow_Condensed, Inter, Noto_Sans_Arabic } from "next/font/google"

import { fontFaceVariables } from "@lib/util/font-stack"

// The store's three fonts (direction A, docs/design/03-direction.md),
// self-hosted by next/font at build time:
//   Barlow Condensed 700/800  headings
//   Inter                     body text and controls
//   Noto Sans Arabic          Arabic-script text (Arabic and Urdu names)
//
// Each font sets a CSS variable with its family and its metric-matched
// fallback. On <html> the layout also sets the real faces alone
// (fontFaceStyle), so tailwind.config.js can put Noto Sans Arabic ahead of
// the Arial fallback; see lib/util/font-stack.ts for why.

export const headingFont = Barlow_Condensed({
  weight: ["700", "800"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-heading",
  display: "swap",
})

export const bodyFont = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
  display: "swap",
})

export const arabicFont = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
})

/** Class names that define the three font variables; set on <html>. */
export const fontVariables = [headingFont, bodyFont, arabicFont]
  .map((font) => font.variable)
  .join(" ")

/** The real faces alone, as CSS variables; set as <html>'s style. */
export const fontFaceStyle = fontFaceVariables({
  heading: headingFont.style.fontFamily,
  body: bodyFont.style.fontFamily,
  arabic: arabicFont.style.fontFamily,
})
